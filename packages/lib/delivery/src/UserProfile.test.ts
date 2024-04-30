import {
    getProfileCreationMessage,
    SignedUserProfile,
    UserProfile,
} from '@dm3-org/dm3-lib-profile';
import { stringify } from '@dm3-org/dm3-lib-shared';
import { ethers } from 'ethers';
import { Session } from './Session';
import {
    getUserProfile,
    submitUserProfile,
    submitUserProfileSiwe,
} from './UserProfile';

const SENDER_NAME = 'alice.eth';
const RANDO_NAME = 'bob.eth';
const SENDER_ADDRESS = '0x71CB05EE1b1F506fF321Da3dac38f25c0c9ce6E1';
const RANDO_ADDRESS = '0xDd36ae7F9a8E34FACf1e110c6e9d37D0dc917855';

const emptyProfile: UserProfile = {
    publicSigningKey: '',
    publicEncryptionKey: '',
    deliveryServices: [''],
};

const signProfile = async (profile: UserProfile) => {
    //0x71CB05EE1b1F506fF321Da3dac38f25c0c9ce6E1
    const mnemonic =
        'announce room limb pattern dry unit scale effort smooth jazz weasel alcohol';

    const wallet = ethers.Wallet.fromMnemonic(mnemonic);

    const profileCreationMessage = getProfileCreationMessage(
        stringify(profile),
        '0x71cb05ee1b1f506ff321da3dac38f25c0c9ce6e1',
    );

    const signature = await wallet.signMessage(profileCreationMessage);

    const signedUserProfile = {
        profile,
        signature,
    };
    return await signedUserProfile;
};

describe('UserProfile', () => {
    describe('SubmitUserProfile', () => {
        it('rejects a userProfile with a wrong signature', async () => {
            const setSession = jest.fn();
            const getSession = () => Promise.resolve(null);
            const getPendingConversations = () => Promise.resolve([]);
            const send = () => {};

            const singedUserProfile = await signProfile(emptyProfile);

            await expect(async () => {
                await submitUserProfile(
                    { resolveName: () => RANDO_ADDRESS } as any,
                    getSession,
                    setSession,
                    RANDO_NAME,
                    singedUserProfile,
                    getPendingConversations,
                    send,
                );
            }).rejects.toEqual(Error('Signature invalid.'));
            expect(setSession).not.toBeCalled();
        });

        it('rejects a userProfile that already exists', async () => {
            const setSession = () => Promise.resolve();
            const getSession = async (address: string) => {
                const session = async (
                    account: string,
                    token: string,
                    profile: UserProfile,
                ): Promise<Session> => {
                    const signedUserProfile = await signProfile(profile);
                    return {
                        account,
                        signedUserProfile,
                        token,
                        createdAt: new Date().getTime(),
                        profileExtension: {
                            encryptionAlgorithm: [],
                            notSupportedMessageTypes: [],
                        },
                    };
                };

                return session(SENDER_NAME, '123', emptyProfile);
            };
            const getPendingConversations = () => Promise.resolve([]);
            const send = () => {};

            const singedUserProfile = await signProfile(emptyProfile);

            await expect(async () => {
                await submitUserProfile(
                    { resolveName: () => SENDER_ADDRESS } as any,
                    getSession,
                    setSession,
                    SENDER_NAME,
                    singedUserProfile,
                    getPendingConversations,
                    send,
                );
            }).rejects.toEqual(Error('Profile exists already'));
        });

        it('skips pending contact without a session', async () => {
            const setSession = jest.fn();
            const getSession = (address: string) => Promise.resolve(null);
            const getPendingConversations = () => Promise.resolve([RANDO_NAME]);
            const send = jest.fn();

            const singedUserProfile = await signProfile(emptyProfile);

            await submitUserProfile(
                { resolveName: () => SENDER_ADDRESS } as any,
                getSession,
                setSession,
                SENDER_NAME,
                singedUserProfile,
                getPendingConversations,
                send,
            );

            expect(setSession).toBeCalled();
            expect(send).not.toBeCalled();
        });

        it('notifies pending contact with a socketId', async () => {
            const setSession = jest.fn();
            const getSession = (address: string) => {
                if (address === RANDO_NAME) {
                    return Promise.resolve({
                        socketId: 'foo',
                    } as Session);
                }
                return Promise.resolve(null);
            };
            const getPendingConversations = () => Promise.resolve([RANDO_NAME]);
            const send = jest.fn();

            const singedUserProfile = await signProfile(emptyProfile);

            await submitUserProfile(
                { resolveName: () => SENDER_ADDRESS } as any,
                getSession,
                setSession,
                SENDER_NAME,
                singedUserProfile,
                getPendingConversations,
                send,
            );

            expect(setSession).toBeCalled();
            expect(send).toBeCalled();
        });

        it('stores a newly created user profile', async () => {
            const setSession = jest.fn();
            const getSession = () => Promise.resolve(null);
            const getPendingConversations = () => Promise.resolve([]);
            const send = () => {};

            const singedUserProfile = await signProfile(emptyProfile);

            await submitUserProfile(
                { resolveName: () => SENDER_ADDRESS } as any,
                getSession,
                setSession,
                SENDER_NAME,
                singedUserProfile,
                getPendingConversations,
                send,
            );

            expect(setSession).toBeCalled();
        });
    });
    describe('SubmitUserProfileSiwe', () => {
        it('rejects a userProfile with a wrong SIWE wrong signature', async () => {
            const setSession = jest.fn();
            const getSession = () => Promise.resolve(null);
            const getPendingConversations = () => Promise.resolve([]);
            const send = () => {};

            const siweMsg = 'my dapp msg';
            const secret = 'my-secret';

            const ownerWallet = ethers.Wallet.createRandom();
            const carrierWallet = new ethers.Wallet(
                ethers.utils.sha256(ethers.utils.toUtf8Bytes(secret)),
            );

            //Sign profile
            const profileSigMessage = getProfileCreationMessage(
                stringify(emptyProfile),
                carrierWallet.address,
            );
            //Sign profile with carrier msg
            const profileSig = await carrierWallet.signMessage(
                profileSigMessage,
            );

            const signedUserProfile: SignedUserProfile = {
                profile: emptyProfile,
                signature: profileSig,
            };

            const siwePayload = {
                //Check ownership of the address
                address: ownerWallet.address,
                message: siweMsg + '123',
                signature: await ownerWallet.signMessage(siweMsg),

                //Account that signed the userProfile on behalf of the address
                carrierAddress: carrierWallet.address,
                signedUserProfile,
            };

            await expect(async () => {
                await submitUserProfileSiwe(
                    getSession,
                    setSession,
                    RANDO_NAME,
                    siwePayload,
                    getPendingConversations,
                    send,
                );
            }).rejects.toEqual(Error('SIWE Signature invalid.'));
            expect(setSession).not.toBeCalled();
        });
        it('rejects a userProfile with an invalid userProfile', async () => {
            const setSession = jest.fn();
            const getSession = () => Promise.resolve(null);
            const getPendingConversations = () => Promise.resolve([]);
            const send = () => {};

            const siweMsg = 'my dapp msg';
            const secret = 'my-secret';

            const ownerWallet = ethers.Wallet.createRandom();
            const carrierWallet = new ethers.Wallet(
                ethers.utils.sha256(ethers.utils.toUtf8Bytes(secret)),
            );

            //Sign profile
            const profileSigMessage = getProfileCreationMessage(
                stringify(emptyProfile),
                carrierWallet.address,
            );
            //Sign profile with carrier msg
            const profileSig = await carrierWallet.signMessage(
                profileSigMessage,
            );

            const signedUserProfile: SignedUserProfile = {
                profile: emptyProfile,
                signature: profileSig,
            };

            const siwePayload = {
                //Check ownership of the address
                address: ownerWallet.address,
                message: siweMsg,
                signature: await ownerWallet.signMessage(siweMsg),

                //Use the worng address to provoke the exception
                carrierAddress: ownerWallet.address,
                signedUserProfile,
            };

            await expect(async () => {
                await submitUserProfileSiwe(
                    getSession,
                    setSession,
                    RANDO_NAME,
                    siwePayload,
                    getPendingConversations,
                    send,
                );
            }).rejects.toEqual(Error('Signature invalid.'));
            expect(setSession).not.toBeCalled();
        });

        it('rejects a userProfile that already exists', async () => {
            const setSession = () => Promise.resolve();
            const getSession = async (address: string) => {
                const session = async (
                    account: string,
                    token: string,
                    profile: UserProfile,
                ): Promise<Session> => {
                    const signedUserProfile = await signProfile(profile);
                    return {
                        account,
                        signedUserProfile,
                        token,
                        createdAt: new Date().getTime(),
                        profileExtension: {
                            encryptionAlgorithm: [],
                            notSupportedMessageTypes: [],
                        },
                    };
                };

                return session(SENDER_NAME, '123', emptyProfile);
            };
            const getPendingConversations = () => Promise.resolve([]);
            const send = () => {};

            const siweMsg = 'my dapp msg';
            const secret = 'my-secret';

            const ownerWallet = ethers.Wallet.createRandom();
            const carrierWallet = new ethers.Wallet(
                ethers.utils.sha256(ethers.utils.toUtf8Bytes(secret)),
            );

            //Sign profile
            const profileSigMessage = getProfileCreationMessage(
                stringify(emptyProfile),
                carrierWallet.address,
            );
            //Sign profile with carrier msg
            const profileSig = await carrierWallet.signMessage(
                profileSigMessage,
            );

            const signedUserProfile: SignedUserProfile = {
                profile: emptyProfile,
                signature: profileSig,
            };

            const siwePayload = {
                //Check ownership of the address
                address: ownerWallet.address,
                message: siweMsg,
                signature: await ownerWallet.signMessage(siweMsg),

                //Use the worng address to provoke the exception
                carrierAddress: carrierWallet.address,
                signedUserProfile,
            };
            await expect(async () => {
                await submitUserProfileSiwe(
                    getSession,
                    setSession,
                    SENDER_NAME,
                    siwePayload,
                    getPendingConversations,
                    send,
                );
            }).rejects.toEqual(Error('Profile exists already'));
        });

        it('stores a newly created user profile', async () => {
            const setSession = jest.fn();
            const getSession = () => Promise.resolve(null);
            const getPendingConversations = () => Promise.resolve([]);
            const send = () => {};
            const siweMsg = 'my dapp msg';
            const secret = 'my-secret';

            const ownerWallet = ethers.Wallet.createRandom();
            const carrierWallet = new ethers.Wallet(
                ethers.utils.sha256(ethers.utils.toUtf8Bytes(secret)),
            );

            //Sign profile
            const profileSigMessage = getProfileCreationMessage(
                stringify(emptyProfile),
                carrierWallet.address,
            );
            //Sign profile with carrier msg
            const profileSig = await carrierWallet.signMessage(
                profileSigMessage,
            );

            const signedUserProfile: SignedUserProfile = {
                profile: emptyProfile,
                signature: profileSig,
            };

            const siwePayload = {
                //Check ownership of the address
                address: ownerWallet.address,
                message: siweMsg,
                signature: await ownerWallet.signMessage(siweMsg),

                //Use the worng address to provoke the exception
                carrierAddress: carrierWallet.address,
                signedUserProfile,
            };

            await submitUserProfileSiwe(
                getSession,
                setSession,
                RANDO_NAME,
                siwePayload,
                getPendingConversations,
                send,
            );

            expect(setSession).toBeCalled();
        });
    });
    describe('GetUserProfile', () => {
        it('Returns undefined if address has no session', async () => {
            const getSession = () => Promise.resolve(null);

            const profile = await getUserProfile(getSession, RANDO_NAME);

            expect(profile).toBeUndefined();
        });
        it('Returns the signedUserProfile if a session was created', async () => {
            const getSession = () =>
                Promise.resolve({ signedUserProfile: {} } as Session);

            const profile = await getUserProfile(getSession, RANDO_NAME);

            expect(profile).not.toBeUndefined();
        });
    });
});
