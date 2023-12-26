# Delegation with Amazon Cognito

The Delegation or On-Behalf-Of (OBO) flow is used when a service, often an API, needs to perform an action, often calling another API, on behalf of the end-user. This is to ensure that the end user has the permissions required to perform the action in the target service. The flow is not a part of the original OAuth 2.0 specification (RFC 6749), it is an extension introduced by Microsoft.

This solution mimics this flow using Amazon Cognito, a complete blog post explaining how the solutuon works can be found [here](https://www.ganhammar.se/posts/delegation-tokens-with-cognito).