// Prints a private P-256 JWK for SIGNING_KEY_JWK.
import { exportJWK, generateKeyPair } from "jose";

const { privateKey } = await generateKeyPair("ES256", { extractable: true });
console.log(JSON.stringify(await exportJWK(privateKey)));
