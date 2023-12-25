import { getSecretHash } from "./src/utils/get-secret-hash";

const [clientId, clientSecret, username] = process.argv.slice(2);

console.log(getSecretHash(clientId, clientSecret, username));