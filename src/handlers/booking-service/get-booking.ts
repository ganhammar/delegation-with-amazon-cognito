import fetch from "node-fetch";
import { getDelegationToken } from "../../utils/get-delegation-token";
import { APIGatewayProxyEvent } from "aws-lambda";
import { GetParametersCommand, SSMClient } from "@aws-sdk/client-ssm";

type ReviewResponse = {
  rating: number;
  latestReviews: string[];
};

const apiBaseUrl =
  "https://f5qtcbdmjb.execute-api.eu-north-1.amazonaws.com/prod/";

async function generateAccessToken(event: APIGatewayProxyEvent) {
  const region = process.env.AWS_REGION!;
  const client = new SSMClient({ region });
  const command = new GetParametersCommand({
    Names: [
      "/delegation/clients/booking-service/id",
      "/delegation/clients/booking-service/secret",
    ],
    WithDecryption: true,
  });
  const response = await client.send(command);
  const [clientId, clientSecret] = response.Parameters!.map((p) => p.Value!);

  const username = event.requestContext?.authorizer?.claims?.username;
  const accessToken = event.headers.Authorization?.replace("Bearer ", "");

  if (!username) {
    throw new Error(
      'The claim "username" is not set in the authorization result'
    );
  }
  if (!accessToken) {
    throw new Error("Access token not present in the headers");
  }

  return await getDelegationToken(
    clientId,
    clientSecret,
    username,
    accessToken,
    "resources/review-service"
  );
}

export const handler = async (event: APIGatewayProxyEvent) => {
  const accessToken = await generateAccessToken(event);
  const response = await fetch(`${apiBaseUrl}review`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const review = (await response.json()) as ReviewResponse;

  return {
    statusCode: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Credentials": true,
    },
    body: JSON.stringify({
      id: "456",
      date: new Date().toISOString(),
      name: "Hotel California",
      review,
    }),
  };
};
