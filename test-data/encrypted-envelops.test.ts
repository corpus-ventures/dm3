/* eslint-disable max-len */
export const testData = {
    // see EncryptedEnvelop (packages/lib/src/messaging/Messaging.ts)
    envelopA: {
        message: '',
        metadata: {
            // For the encryption format see EncryptedPayload (packages/lib/crypto/Encryption.ts).
            deliveryInformation:
                '{"ciphertext":"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","nonce":"0x5f564ab2e955e921e131621e","ephemPublicKey":"yhl5dtz+xbvMczZtysmFiQ5Mi30cJcitqiz33cIAPy4="}',
            signature: '',
            encryptedMessageHash: '',
            version: '',
            encryptionScheme: 'x25519-chacha20-poly1305',
        },
    },
    envelopB: {
        message: '',
        metadata: {
            deliveryInformation:
                '{"ciphertext":"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","nonce":"0x55d8d963b4712d3b74a1c3f7","ephemPublicKey":"JswCtQ84+mfSYSE8+MzzUsjYG4aSZIBZIvA0IIvUGn4="}',
            signature: '',
            encryptedMessageHash: '',
            version: '',
            encryptionScheme: 'x25519-chacha20-poly1305',
        },
    },
    deliveryInformation: {
        // contains the stringified, encrypted and base64 encoded DeliveryInfromation (packages/lib/src/messaging/Messaging.ts) object.
        ciphertext:
            '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',
        // random nonce
        nonce: '0x5f564ab2e955e921e131621e',
        // base64 encoded ephemeral public key
        ephemPublicKey: 'yhl5dtz+xbvMczZtysmFiQ5Mi30cJcitqiz33cIAPy4=',
    },
    deliveryInformationB: {
        ciphertext:
            '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',
        nonce: '0x55d8d963b4712d3b74a1c3f7',
        ephemPublicKey: 'JswCtQ84+mfSYSE8+MzzUsjYG4aSZIBZIvA0IIvUGn4=',
    },
};
