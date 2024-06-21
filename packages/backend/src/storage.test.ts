import { encryptAsymmetric } from '@dm3-org/dm3-lib-crypto';
import {
    Session,
    generateAuthJWT,
    spamFilter,
} from '@dm3-org/dm3-lib-delivery';
import {
    Envelop,
    Message,
    buildEnvelop,
    createMessage,
} from '@dm3-org/dm3-lib-messaging';
import { SignedUserProfile } from '@dm3-org/dm3-lib-profile';
import { sha256 } from '@dm3-org/dm3-lib-shared';
import {
    MockDeliveryServiceProfile,
    MockMessageFactory,
    MockedUserProfile,
    getMockDeliveryServiceProfile,
    mockUserProfile,
} from '@dm3-org/dm3-lib-test-helper';
import { PrismaClient } from '@prisma/client';
import bodyParser from 'body-parser';
import { ethers } from 'ethers';
import express from 'express';
import request from 'supertest';
import winston from 'winston';
import {
    IDatabase,
    Redis,
    getDatabase,
    getRedisClient,
} from './persistence/getDatabase';
import { MessageRecord } from './persistence/storage/postgres/utils/MessageRecord';
import storage from './storage';

const keysA = {
    encryptionKeyPair: {
        publicKey: 'eHmMq29FeiPKfNPkSctPuZGXvV0sKeO/KZkX2nXvMgw=',
        privateKey: 'pMI77F2w3GK+omZCB4A61WDqISOOnWGXR2f/MTLbqbY=',
    },
    signingKeyPair: {
        publicKey: '+tkDQWZfv9ixBmObsf8tgTHTZajwAE9muTtFAUj2e9I=',
        privateKey:
            '+DpeBjCzICFoi743/466yJunsHR55Bhr3GnqcS4cuJX62QNBZl+/2LEGY5ux/y2BMdNlqPAAT2a5O0UBSPZ70g==',
    },
    storageEncryptionKey: '+DpeBjCzICFoi743/466yJunsHR55Bhr3GnqcS4cuJU=',
    storageEncryptionNonce: 0,
};

const serverSecret = 'veryImportantSecretToGenerateAndValidateJSONWebTokens';

global.logger = winston.createLogger({
    transports: [new winston.transports.Console()],
});

describe('Storage', () => {
    let app;
    let token = generateAuthJWT('bob.eth', serverSecret);
    let prisma: PrismaClient;
    let sender: MockedUserProfile;
    let receiver: MockedUserProfile;
    let deliveryService: MockDeliveryServiceProfile;
    let redisClient: Redis;

    beforeEach(async () => {
        prisma = new PrismaClient();
        redisClient = await getRedisClient();

        await redisClient.flushDb();
        app = express();
        app.use(bodyParser.json());

        //token = await createAuthToken();

        const bobWallet = ethers.Wallet.createRandom();
        const aliceWallet = ethers.Wallet.createRandom();
        const dsWallet = ethers.Wallet.createRandom();

        sender = await mockUserProfile(bobWallet, 'bob.eth', [
            'http://localhost:3000',
        ]);
        receiver = await mockUserProfile(aliceWallet, 'alice.eth', [
            'http://localhost:3000',
        ]);
        deliveryService = await getMockDeliveryServiceProfile(
            dsWallet,
            'http://localhost:3000',
        );

        const db = await getDatabase(redisClient, prisma);

        const sessionMocked = {
            challenge: '123',
            token,
            signedUserProfile: {
                profile: {
                    publicSigningKey: keysA.signingKeyPair.publicKey,
                },
            } as SignedUserProfile,
        } as Session & { spamFilterRules: spamFilter.SpamFilterRules };

        const dbMocked = {
            getSession: async (ensName: string) =>
                Promise.resolve<
                    Session & {
                        spamFilterRules: spamFilter.SpamFilterRules;
                    }
                >(sessionMocked),
            setSession: async (_: string, __: Session) => {},
            getIdEnsName: async (ensName: string) => ensName,
        };
        const dbFinal: IDatabase = { ...db, ...dbMocked };

        //const web3ProviderBase = getWeb3Provider(process.env);

        const web3ProviderMock = {
            resolveName: async () =>
                '0x71CB05EE1b1F506fF321Da3dac38f25c0c9ce6E1',
        };

        // const web3Provider: ethers.providers.JsonRpcProvider = {
        //     ...web3ProviderBase,
        //     ...web3ProviderMock,
        // };

        app.use(storage(dbFinal, web3ProviderMock as any, serverSecret));
    });

    afterEach(async () => {
        await prisma.encryptedMessage.deleteMany();
        await prisma.conversation.deleteMany();
        await prisma.account.deleteMany();
        await redisClient.flushDb();
        await redisClient.disconnect();
    });

    describe('addConversation', () => {
        it('can add conversation', async () => {
            const aliceId = 'alice.eth';

            const { status } = await request(app)
                .post(`/new/bob.eth/addConversation`)
                .set({
                    authorization: 'Bearer ' + token,
                })
                .send({
                    encryptedContactName: aliceId,
                });
            expect(status).toBe(200);

            const { body } = await request(app)
                .get(`/new/bob.eth/getConversations`)
                .set({
                    authorization: 'Bearer ' + token,
                })
                .send();

            expect(status).toBe(200);
            expect(body[0].contact).toEqual(aliceId);
            expect(body.length).toBe(1);
        });
        it('handle duplicates add conversation', async () => {
            const aliceId = 'alice.eth';
            const ronId = 'ron.eth';

            await request(app)
                .post(`/new/bob.eth/addConversation`)
                .set({
                    authorization: 'Bearer ' + token,
                })
                .send({
                    encryptedContactName: aliceId,
                });
            await request(app)
                .post(`/new/bob.eth/addConversation`)
                .set({
                    authorization: 'Bearer ' + token,
                })
                .send({
                    encryptedContactName: ronId,
                });
            await request(app)
                .post(`/new/bob.eth/addConversation`)
                .set({
                    authorization: 'Bearer ' + token,
                })
                .send({
                    encryptedContactName: aliceId,
                });

            const { body } = await request(app)
                .get(`/new/bob.eth/getConversations`)
                .set({
                    authorization: 'Bearer ' + token,
                })
                .send();

            expect(body[0].contact).toEqual(aliceId);
            expect(body[1].contact).toEqual(ronId);
            expect(body.length).toBe(2);
        });
    });

    describe('toggleHideConversation', () => {
        it('can hide conversation', async () => {
            const aliceId = 'alice.eth';
            const ronId = 'ron.eth';

            const {} = await request(app)
                .post(`/new/bob.eth/addConversation`)
                .set({
                    authorization: 'Bearer ' + token,
                })
                .send({
                    encryptedContactName: sha256(aliceId),
                });
            const {} = await request(app)
                .post(`/new/bob.eth/addConversation`)
                .set({
                    authorization: 'Bearer ' + token,
                })
                .send({
                    encryptedContactName: sha256(ronId),
                });

            const { status: hideStatus } = await request(app)
                .post(`/new/bob.eth/toggleHideConversation`)
                .set({
                    authorization: 'Bearer ' + token,
                })
                .send({
                    encryptedContactName: sha256(aliceId),
                    hide: true,
                });

            expect(hideStatus).toBe(200);

            const { status: getMessagesStatus, body } = await request(app)
                .get(`/new/bob.eth/getConversations`)
                .set({
                    authorization: 'Bearer ' + token,
                })
                .send();

            expect(getMessagesStatus).toBe(200);
            expect(body.length).toBe(1);
            expect(body[0].contact).toEqual(sha256(ronId));
        });
        it('preview message is contained for every conversation', async () => {
            const messageFactory = MockMessageFactory(
                sender,
                receiver,
                deliveryService,
            );

            const envelop1 = await messageFactory.createEncryptedEnvelop(
                'Hello1',
            );
            const envelop2 = await messageFactory.createEncryptedEnvelop(
                'Hello2',
            );
            const envelop3 = await messageFactory.createEncryptedEnvelop(
                'Hello3',
            );

            await request(app)
                .post(`/new/bob.eth/addMessage`)
                .set({
                    authorization: 'Bearer ' + token,
                })
                .send({
                    encryptedEnvelopContainer: JSON.stringify(envelop1),
                    encryptedContactName: sha256(receiver.account.ensName),
                    messageId: '123',
                    createdAt: 0,
                });
            await request(app)
                .post(`/new/bob.eth/addMessage`)
                .set({
                    authorization: 'Bearer ' + token,
                })
                .send({
                    encryptedEnvelopContainer: JSON.stringify(envelop2),
                    encryptedContactName: sha256(receiver.account.ensName),
                    messageId: '456',
                    createdAt: 1,
                });
            await request(app)
                .post(`/new/bob.eth/addMessage`)
                .set({
                    authorization: 'Bearer ' + token,
                })
                .send({
                    encryptedEnvelopContainer: JSON.stringify(envelop3),
                    encryptedContactName: sha256(receiver.account.ensName),
                    messageId: '789',
                    createdAt: 2,
                });

            const { body } = await request(app)
                .get(`/new/bob.eth/getConversations`)
                .set({
                    authorization: 'Bearer ' + token,
                })
                .send();

            console.log(body);

            expect(body.length).toBe(1);
            expect(body[0].contact).toEqual(sha256(receiver.account.ensName));
            expect(body[0].previewMessage.id).toEqual(sha256('bob.eth' + 789));
        });
    });
    describe('addMessage', () => {
        it('can add message', async () => {
            const messageFactory = MockMessageFactory(
                sender,
                receiver,
                deliveryService,
            );
            const envelop1 = await messageFactory.createEncryptedEnvelop(
                'Hello1',
            );

            const { status } = await request(app)
                .post(`/new/bob.eth/addMessage`)
                .set({
                    authorization: 'Bearer ' + token,
                })
                .send({
                    encryptedEnvelopContainer: JSON.stringify(envelop1),
                    encryptedContactName: sha256(receiver.account.ensName),
                    messageId: '123',
                });
            expect(status).toBe(200);

            const { body } = await request(app)
                .get(`/new/bob.eth/getConversations`)
                .set({
                    authorization: 'Bearer ' + token,
                })
                .send();

            expect(status).toBe(200);
            expect(body[0].contact).toEqual(sha256(receiver.account.ensName));
            expect(body.length).toBe(1);

            const { status: getMessagesStatus, body: messages } = await request(
                app,
            )
                .get(
                    `/new/bob.eth/getMessages/${sha256(
                        receiver.account.ensName,
                    )}/0`,
                )
                .set({
                    authorization: 'Bearer ' + token,
                })
                .send();

            expect(getMessagesStatus).toBe(200);
            expect(messages.length).toBe(1);
            expect(
                JSON.parse(JSON.parse(messages[0]).encryptedEnvelopContainer),
            ).toStrictEqual(envelop1);
        });
        it('messages are separated by account id', async () => {
            const messageFactory = MockMessageFactory(
                sender,
                receiver,
                deliveryService,
            );
            const envelop = await messageFactory.createEncryptedEnvelop(
                'Hello1',
            );

            await request(app)
                .post(`/new/bob.eth/addMessage`)
                .set({
                    authorization: 'Bearer ' + token,
                })
                .send({
                    encryptedEnvelopContainer: JSON.stringify(envelop),
                    encryptedContactName: sha256(receiver.account.ensName),
                    messageId: sha256('bob.eth' + '123'),
                });

            const tokenAlice = generateAuthJWT('alice.eth', serverSecret);

            await request(app)
                .post(`/new/alice.eth/addMessage`)
                .set({
                    authorization: 'Bearer ' + tokenAlice,
                })
                .send({
                    encryptedEnvelopContainer: JSON.stringify(envelop),
                    encryptedContactName: sha256(sender.account.ensName),
                    messageId: sha256('alice.eth' + '123'),
                });

            const { body: bobConversations } = await request(app)
                .get(`/new/bob.eth/getConversations`)
                .set({
                    authorization: 'Bearer ' + token,
                })
                .send();
            const { body: aliceConversations } = await request(app)
                .get(`/new/alice.eth/getConversations`)
                .set({
                    authorization: 'Bearer ' + tokenAlice,
                })
                .send();

            expect(bobConversations[0].contact).toEqual(
                sha256(receiver.account.ensName),
            );
            expect(bobConversations.length).toBe(1);

            expect(aliceConversations.length).toBe(1);
            expect(aliceConversations[0].contact).toEqual(
                sha256(sender.account.ensName),
            );

            const { body: bobMessages } = await request(app)
                .get(
                    `/new/bob.eth/getMessages/${sha256(
                        receiver.account.ensName,
                    )}/0`,
                )
                .set({
                    authorization: 'Bearer ' + token,
                })
                .send();

            expect(bobMessages.length).toBe(1);
            expect(
                JSON.parse(
                    JSON.parse(bobMessages[0]).encryptedEnvelopContainer,
                ),
            ).toStrictEqual(envelop);

            const { body: aliceMessages } = await request(app)
                .get(
                    `/new/alice.eth/getMessages/${sha256(
                        sender.account.ensName,
                    )}/0`,
                )
                .set({
                    authorization: 'Bearer ' + tokenAlice,
                })
                .send();

            expect(aliceMessages.length).toBe(1);
        });
        it('can add message to existing conversation', async () => {
            await request(app)
                .post(`/new/bob.eth/addConversation`)
                .set({
                    authorization: 'Bearer ' + token,
                })
                .send({
                    encryptedContactName: sha256(receiver.account.ensName),
                });

            const messageFactory = MockMessageFactory(
                sender,
                receiver,
                deliveryService,
            );
            const envelop = await messageFactory.createEncryptedEnvelop(
                'Hello1',
            );

            const { status } = await request(app)
                .post(`/new/bob.eth/addMessage`)
                .set({
                    authorization: 'Bearer ' + token,
                })
                .send({
                    encryptedEnvelopContainer: JSON.stringify(envelop),
                    encryptedContactName: sha256(receiver.account.ensName),
                    messageId: '123',
                });
            expect(status).toBe(200);

            const { body } = await request(app)
                .get(`/new/bob.eth/getConversations`)
                .set({
                    authorization: 'Bearer ' + token,
                })
                .send();

            expect(status).toBe(200);
            expect(body[0].contact).toEqual(sha256(receiver.account.ensName));
            expect(body.length).toBe(1);

            const { status: getMessagesStatus, body: messages } = await request(
                app,
            )
                .get(
                    `/new/bob.eth/getMessages/${sha256(
                        receiver.account.ensName,
                    )}/0`,
                )
                .set({
                    authorization: 'Bearer ' + token,
                })
                .send();

            expect(getMessagesStatus).toBe(200);
            expect(messages.length).toBe(1);
            expect(
                JSON.parse(JSON.parse(messages[0]).encryptedEnvelopContainer),
            ).toStrictEqual(envelop);
        });
        it('cant add multiple messages with the same id', async () => {
            const messageFactory = MockMessageFactory(
                sender,
                receiver,
                deliveryService,
            );
            const envelop = await messageFactory.createEncryptedEnvelop(
                'Hello1',
            );

            await request(app)
                .post(`/new/bob.eth/addMessage`)
                .set({
                    authorization: 'Bearer ' + token,
                })
                .send({
                    encryptedEnvelopContainer: JSON.stringify(envelop),
                    encryptedContactName: sha256(receiver.account.ensName),
                    messageId: '123',
                });
            await request(app)
                .post(`/new/bob.eth/addMessage`)
                .set({
                    authorization: 'Bearer ' + token,
                })
                .send({
                    encryptedEnvelopContainer: JSON.stringify(envelop),
                    encryptedContactName: sha256(receiver.account.ensName),
                    messageId: '456',
                });

            const { status } = await request(app)
                .post(`/new/bob.eth/addMessage`)
                .set({
                    authorization: 'Bearer ' + token,
                })
                .send({
                    encryptedEnvelopContainer: JSON.stringify(envelop),
                    encryptedContactName: sha256(receiver.account.ensName),
                    messageId: '123',
                });

            expect(status).toBe(400);

            const { body } = await request(app)
                .get(`/new/bob.eth/getConversations`)
                .set({
                    authorization: 'Bearer ' + token,
                })
                .send();

            expect(body[0].contact).toEqual(sha256(receiver.account.ensName));
            expect(body.length).toBe(1);

            const { status: getMessagesStatus, body: messages } = await request(
                app,
            )
                .get(
                    `/new/bob.eth/getMessages/${sha256(
                        receiver.account.ensName,
                    )}/0`,
                )
                .set({
                    authorization: 'Bearer ' + token,
                })
                .send();

            expect(getMessagesStatus).toBe(200);
            expect(messages.length).toBe(2);

            expect(
                JSON.parse(JSON.parse(messages[0]).encryptedEnvelopContainer),
            ).toStrictEqual(envelop);
            expect(
                JSON.parse(JSON.parse(messages[1]).encryptedEnvelopContainer),
            ).toStrictEqual(envelop);
        });
    });
    describe('addMessageBatch', () => {
        it('can add a messageBatch', async () => {
            const messageFactory = MockMessageFactory(
                sender,
                receiver,
                deliveryService,
            );
            const envelop = await messageFactory.createEncryptedEnvelop(
                'Hello1',
            );
            const { status } = await request(app)
                .post(`/new/bob.eth/addMessageBatch`)
                .set({
                    authorization: 'Bearer ' + token,
                })
                .send({
                    encryptedContactName: sha256(receiver.account.ensName),
                    messageBatch: [
                        {
                            encryptedEnvelopContainer: JSON.stringify(envelop),
                            messageId: '123',
                        },
                        {
                            encryptedEnvelopContainer: JSON.stringify(envelop),
                            messageId: '456',
                        },
                    ],
                });
            expect(status).toBe(200);

            const { body } = await request(app)
                .get(`/new/bob.eth/getConversations`)
                .set({
                    authorization: 'Bearer ' + token,
                })
                .send();

            expect(status).toBe(200);
            expect(body[0].contact).toEqual(sha256(receiver.account.ensName));
            expect(body.length).toBe(1);

            const { status: getMessagesStatus, body: messages } = await request(
                app,
            )
                .get(
                    `/new/bob.eth/getMessages/${sha256(
                        receiver.account.ensName,
                    )}/0`,
                )
                .set({
                    authorization: 'Bearer ' + token,
                })
                .send();

            expect(getMessagesStatus).toBe(200);
            expect(messages.length).toBe(2);
            expect(
                JSON.parse(JSON.parse(messages[0]).encryptedEnvelopContainer),
            ).toStrictEqual(envelop);
        });
    });
    describe('getNumberOfMessages', () => {
        it('can get number of messages', async () => {
            const messageFactory = MockMessageFactory(
                sender,
                receiver,
                deliveryService,
            );
            const envelop = await messageFactory.createEncryptedEnvelop(
                'Hello1',
            );
            await request(app)
                .post(`/new/bob.eth/addMessage`)
                .set({
                    authorization: 'Bearer ' + token,
                })
                .send({
                    encryptedEnvelopContainer: JSON.stringify(envelop),
                    encryptedContactName: sha256(receiver.account.ensName),
                    messageId: '123',
                });

            await request(app)
                .post(`/new/bob.eth/addMessage`)
                .set({
                    authorization: 'Bearer ' + token,
                })
                .send({
                    encryptedEnvelopContainer: JSON.stringify(envelop),
                    encryptedContactName: sha256(receiver.account.ensName),
                    messageId: '456',
                });

            const { status: addDuplicateStatus } = await request(app)
                .post(`/new/bob.eth/addMessage`)
                .set({
                    authorization: 'Bearer ' + token,
                })
                .send({
                    encryptedEnvelopContainer: JSON.stringify(envelop),
                    encryptedContactName: sha256(receiver.account.ensName),
                    messageId: '123',
                });

            const { status, body } = await request(app)
                .get(
                    `/new/bob.eth/getNumberOfMessages/${sha256(
                        receiver.account.ensName,
                    )}`,
                )
                .set({
                    authorization: 'Bearer ' + token,
                })
                .send();
            expect(status).toBe(200);
            expect(body).toBe(2);
        });
    });
    describe('getNumberOfConversations', () => {
        it('can get number of conversations', async () => {
            const aliceId = 'alice.eth';
            const bobId = 'bob.eth';

            const { status } = await request(app)
                .post(`/new/bob.eth/addConversation`)
                .set({
                    authorization: 'Bearer ' + token,
                })
                .send({
                    encryptedContactName: aliceId,
                });
            expect(status).toBe(200);

            const { status: secondStatus } = await request(app)
                .post(`/new/bob.eth/addConversation`)
                .set({
                    authorization: 'Bearer ' + token,
                })
                .send({
                    encryptedContactName: 'testContact',
                });
            expect(secondStatus).toBe(200);

            const { status: thirdStatus } = await request(app)
                .post(`/new/bob.eth/addConversation`)
                .set({
                    authorization: 'Bearer ' + token,
                })
                .send({
                    encryptedContactName: 'testContact2',
                });
            expect(thirdStatus).toBe(200);

            const { status: fourthStatus, body } = await request(app)
                .get(`/new/bob.eth/getNumberOfConversations`)
                .set({
                    authorization: 'Bearer ' + token,
                })
                .send();
            expect(fourthStatus).toBe(200);
            expect(body).toBe(3);
        });
    });
    describe('editMessageBatch', () => {
        it('should create a message if they has not been created before', async () => {
            const encryptedContactName = 'testContactName';
            const payload: MessageRecord[] = [
                {
                    createdAt: 123,
                    messageId: 'testMessageId',
                    encryptedEnvelopContainer: 'testEncryptedEnvelopContainer',
                },
            ];

            const { status } = await request(app)
                .post(`/new/bob.eth/editMessageBatch`)
                .set({
                    authorization: 'Bearer ' + token,
                })
                .send({
                    encryptedContactName,
                    editMessageBatchPayload: payload,
                });

            expect(status).toBe(200);

            //get messages
            const { body } = await request(app)
                .get(`/new/bob.eth/getMessages/${encryptedContactName}/0`)
                .set({
                    authorization: 'Bearer ' + token,
                })
                .send();

            expect(body.length).toBe(1);
            expect(JSON.parse(body[0]).encryptedEnvelopContainer).toBe(
                payload[0].encryptedEnvelopContainer,
            );
        });

        it('should update encryptedMessage message', async () => {
            const contactName = 'testContactName';
            const originalPayload: MessageRecord[] = [
                {
                    createdAt: 123,
                    messageId: 'testMessageId',
                    encryptedEnvelopContainer: 'testEncryptedEnvelopContainer',
                },
            ];
            const { status } = await request(app)
                .post(`/new/bob.eth/addMessage`)
                .set({
                    authorization: 'Bearer ' + token,
                })
                .send({
                    encryptedEnvelopContainer: JSON.stringify(originalPayload),
                    encryptedContactName: sha256(receiver.account.ensName),
                    messageId: '123',
                });
            expect(status).toBe(200);

            const updatedPayload: MessageRecord[] = [
                {
                    createdAt: 123,
                    messageId: 'testMessageId',
                    encryptedEnvelopContainer: 'NEW ENVELOP',
                },
            ];

            const { status: editStatus } = await request(app)
                .post(`/new/bob.eth/editMessageBatch`)
                .set({
                    authorization: 'Bearer ' + token,
                })
                .send({
                    encryptedContactName: contactName,
                    editMessageBatchPayload: updatedPayload,
                });

            expect(editStatus).toBe(200);

            //get messages
            const { body } = await request(app)
                .get(`/new/bob.eth/getMessages/${contactName}/0`)
                .set({
                    authorization: 'Bearer ' + token,
                })
                .send();

            expect(body.length).toBe(1);
            expect(JSON.parse(body[0]).encryptedEnvelopContainer).toBe(
                updatedPayload[0].encryptedEnvelopContainer,
            );
        });
    });
    describe('Migration', () => {
        it('should migrate storage', async () => {
            const { body: preMigrationStatus } = await request(app)
                .get(`/new/bob.eth/migrationStatus`)
                .set({
                    authorization: 'Bearer ' + token,
                })
                .send();

            expect(preMigrationStatus).toBe(false);

            const { status } = await request(app)
                .post(`/new/bob.eth/migrationStatus`)
                .set({
                    authorization: 'Bearer ' + token,
                })
                .send();

            expect(status).toBe(200);

            const { body: postMigrationStatus } = await request(app)
                .get(`/new/bob.eth/migrationStatus`)
                .set({
                    authorization: 'Bearer ' + token,
                })
                .send();

            expect(postMigrationStatus).toBe(true);
        });
    });
});
