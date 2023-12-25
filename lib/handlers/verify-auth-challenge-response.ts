import { Callback, Context, VerifyAuthChallengeResponseTriggerEvent } from "aws-lambda";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { validateToken } from "./utils/verify-token";

exports.handler = async function (
  event: VerifyAuthChallengeResponseTriggerEvent,
  _: Context,
  callback: Callback
) {
  const region = process.env.AWS_REGION!;
  const ssmClient = new SSMClient({ region });
  const command = new GetParameterCommand({ Name: "/delegation/userpool/id" });
  const userPoolId = (await ssmClient.send(command)).Parameter!.Value!;

  // Check if the user's answer matches the secret code
  if (event.request.challengeAnswer) {
    const result = await validateToken(event.request.challengeAnswer, userPoolId, region);

    if (result) {
      event.response.answerCorrect = true;
    }
  } else {
    event.response.answerCorrect = false;
  }

  callback(null, event);
};