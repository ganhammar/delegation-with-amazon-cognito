import { CfnOutput, Duration, Stack, StackProps } from "aws-cdk-lib";
import {
  AuthorizationType,
  CfnAuthorizer,
  LambdaIntegration,
  RestApi,
} from "aws-cdk-lib/aws-apigateway";
import {
  CfnUserPool,
  OAuthScope,
  StringAttribute,
  UserPool,
  UserPoolClient,
  UserPoolOperation,
} from "aws-cdk-lib/aws-cognito";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";

const MEMORY_SIZE = 1769;

export class DelegationWithAmazonCognitoStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Create user pool
    const userPool = new UserPool(this, "UserPool", {
      userPoolName: "delegation",
      customAttributes: {
        permission: new StringAttribute({ mutable: true }),
      },
    });

    userPool.addDomain("UserPoolDomain", {
      cognitoDomain: {
        domainPrefix: "delegation",
      },
    });

    // Enable advanced security
    const cfnUserPool = userPool.node.defaultChild as CfnUserPool;
    cfnUserPool.userPoolAddOns = {
      advancedSecurityMode: "ENFORCED",
    };

    // Store user pool id in SSM
    new StringParameter(this, "UserPoolIdParameter", {
      parameterName: "/delegation/userpool/id",
      stringValue: userPool.userPoolId,
    });

    // Add resource server
    const resourceServer = userPool.addResourceServer("ResourceServer", {
      identifier: "resources",
      scopes: [
        {
          scopeName: "booking-service",
          scopeDescription: "Access booking service",
        },
        {
          scopeName: "review-service",
          scopeDescription: "Access review service",
        },
      ],
    });

    // Define pre token generation lambda
    const preTokenGeneration = new NodejsFunction(this, "PreTokenGeneration", {
      runtime: Runtime.NODEJS_20_X,
      handler: "handler",
      entry: `${__dirname}/handlers/pre-token-generation.ts`,
      memorySize: MEMORY_SIZE,
    });

    preTokenGeneration.addToRolePolicy(
      new PolicyStatement({
        actions: ["ssm:GetParameter"],
        resources: [
          Stack.of(this).formatArn({
            service: "ssm",
            resource: "parameter/delegation/userpool/id",
          }),
        ],
      }),
    );

    preTokenGeneration.addToRolePolicy(
      new PolicyStatement({
        actions: ["cognito-idp:DescribeUserPoolClient"],
        resources: ["*"],
      })
    );

    userPool.addTrigger(
      UserPoolOperation.PRE_TOKEN_GENERATION,
      preTokenGeneration
    ); // Needs to be changed to V2_0 in console until CDK supports it

    // Define auth challenge lambda
    const defineAuthChallenge = new NodejsFunction(
      this,
      "DefineAuthChallenge",
      {
        runtime: Runtime.NODEJS_20_X,
        handler: "handler",
        entry: `${__dirname}/handlers/define-auth-challenge.ts`,
        memorySize: MEMORY_SIZE,
      }
    );

    userPool.addTrigger(
      UserPoolOperation.DEFINE_AUTH_CHALLENGE,
      defineAuthChallenge
    );

    // Define verify auth challenge response lambda
    const verifyAuthChallengeResponse = new NodejsFunction(
      this,
      "VerifyAuthChallengeResponse",
      {
        runtime: Runtime.NODEJS_20_X,
        handler: "handler",
        entry: `${__dirname}/handlers/verify-auth-challenge-response.ts`,
        memorySize: MEMORY_SIZE,
        environment: {
          REGION: this.region,
        },
      }
    );

    verifyAuthChallengeResponse.addToRolePolicy(
      new PolicyStatement({
        actions: ["ssm:GetParameter"],
        resources: [
          Stack.of(this).formatArn({
            service: "ssm",
            resource: "parameter/delegation/userpool/id",
          }),
        ],
      })
    );

    userPool.addTrigger(
      UserPoolOperation.VERIFY_AUTH_CHALLENGE_RESPONSE,
      verifyAuthChallengeResponse
    );

    // Create booking frontend client
    const bookingFrontClient = new UserPoolClient(this, "BookingFrontClient", {
      userPool,
      generateSecret: false,
      userPoolClientName: "booking-front",
      authFlows: {
        userPassword: false,
        userSrp: true,
        custom: false,
        adminUserPassword: false,
      },
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
        },
        scopes: [
          OAuthScope.EMAIL,
          OAuthScope.OPENID,
          OAuthScope.PROFILE,
          OAuthScope.custom(
            `${resourceServer.userPoolResourceServerId}/booking-service`
          ),
        ],
        callbackUrls: ["http://localhost:3000"],
        logoutUrls: ["http://localhost:3000"],
      },
    });

    // Create booking service client
    const bookingServiceClient = new UserPoolClient(
      this,
      "BookingServiceClient",
      {
        userPool,
        generateSecret: true,
        userPoolClientName: "booking-service",
        oAuth: {
          flows: {
            clientCredentials: true,
          },
          scopes: [
            OAuthScope.custom(
              `${resourceServer.userPoolResourceServerId}/review-service`
            ),
          ],
        },
      }
    );

    new StringParameter(this, "BookingServiceClientIdParameter", {
      parameterName: "/delegation/clients/booking-service/id",
      stringValue: bookingServiceClient.userPoolClientId,
    });

    // Should be stored in Secrets Manager or as a SecureString in SSM (which isn't supported by CDK)
    new StringParameter(this, "BookingServiceClientSecretParameter", {
      parameterName: "/delegation/clients/booking-service/secret",
      stringValue: bookingServiceClient.userPoolClientSecret.unsafeUnwrap(),
    });

    // Crate REST API
    const api = new RestApi(this, "DelegationApi", {
      restApiName: "delegation-api",
    });

    // Create Booking Lambda
    const getBookingLambda = new NodejsFunction(this, "GetBooking", {
      runtime: Runtime.NODEJS_20_X,
      handler: "handler",
      entry: `${__dirname}/../src/handlers/booking-service/get-booking.ts`,
      memorySize: MEMORY_SIZE,
    });
    const getBookingIntegration = new LambdaIntegration(getBookingLambda);

    getBookingLambda.addToRolePolicy(
      new PolicyStatement({
        actions: ["ssm:GetParameters"],
        resources: [
          Stack.of(this).formatArn({
            service: "ssm",
            resource: "parameter/delegation/clients/booking-service/*",
          }),
        ],
      })
    );

    // Create Review Lambda
    const getReviewLambda = new NodejsFunction(this, "GetReview", {
      runtime: Runtime.NODEJS_20_X,
      handler: "handler",
      entry: `${__dirname}/../src/handlers/review-service/get-review.ts`,
      memorySize: MEMORY_SIZE,
      timeout: Duration.seconds(10),
    });
    const getReviewIntegration = new LambdaIntegration(getReviewLambda);

    // Create Cognito authorizer
    const authorizer = new CfnAuthorizer(this, "CognitoAuthorizer", {
      restApiId: api.restApiId,
      type: "COGNITO_USER_POOLS",
      identitySource: "method.request.header.Authorization",
      providerArns: [userPool.userPoolArn],
      name: "CognitoAuthorizer",
    });

    // Add review resource
    api.root.addResource("review").addMethod("GET", getReviewIntegration, {
      authorizationType: AuthorizationType.COGNITO,
      authorizer: {
        authorizerId: authorizer.ref,
      },
      authorizationScopes: [
        `${resourceServer.userPoolResourceServerId}/review-service`,
      ],
    });

    // Add booking resource
    const bookingResource = api.root.addResource("booking");
    bookingResource.addMethod("GET", getBookingIntegration, {
      authorizationType: AuthorizationType.COGNITO,
      authorizer: {
        authorizerId: authorizer.ref,
      },
      authorizationScopes: [
        `${resourceServer.userPoolResourceServerId}/booking-service`,
      ],
    });
    bookingResource.addCorsPreflight({
      allowOrigins: ["http://localhost:3000"],
      allowMethods: ["GET", "OPTIONS", "POST", "PUT", "DELETE"],
      allowHeaders: ["*"],
    });

    // CDK Outputs
    new CfnOutput(this, "UserPoolIdOutput", {
      value: userPool.userPoolId,
    });

    new CfnOutput(this, "BookingFrontClientOutput", {
      value: bookingFrontClient.userPoolClientId,
    });

    new CfnOutput(this, "BookingServiceClientIdOutput", {
      value: bookingServiceClient.userPoolClientId,
    });
  }
}
