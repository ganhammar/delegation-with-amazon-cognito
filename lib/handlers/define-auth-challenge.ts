import { Callback, Context, DefineAuthChallengeTriggerEvent } from "aws-lambda";

exports.handler = function (
  event: DefineAuthChallengeTriggerEvent,
  _: Context,
  callback: Callback
) {
  if (event.request.session.length === 0) {
    // If it's the first sign in attempt, present the password verifier challenge
    event.response.issueTokens = false;
    event.response.failAuthentication = false;
    event.response.challengeName = "DELEGATION";
  } else if (
    event.request.session.length === 1 &&
    event.request.session[0].challengeResult === true
  ) {
    // If the password verifier returns a successful result, issue tokens
    event.response.issueTokens = true;
    event.response.failAuthentication = false;
  } else {
    // If the password verifier returns a failed result, fail authentication
    event.response.issueTokens = false;
    event.response.failAuthentication = true;
  }

  callback(null, event);
};