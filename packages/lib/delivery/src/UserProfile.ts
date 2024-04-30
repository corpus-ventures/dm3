import {
    SignedUserProfile,
    checkUserProfile,
    checkUserProfileWithAddress,
    formatAddress,
    normalizeEnsName,
} from '@dm3-org/dm3-lib-profile';
import { getDefaultProfileExtension } from '@dm3-org/dm3-lib-profile';
import { Session } from './Session';
import { v4 as uuidv4 } from 'uuid';
import { ethers } from 'ethers';
import { logDebug } from '@dm3-org/dm3-lib-shared';

const handlePendingConversations = async (
    ensName: string,
    getSession: (accountAddress: string) => Promise<Session | null>,
    getPendingConversations: (accountAddress: string) => Promise<string[]>,
    send: (socketId: string) => void,
) => {
    const pending = await getPendingConversations(ensName);

    await Promise.all(
        pending.map(async (pendingEntry) => {
            const contact = normalizeEnsName(pendingEntry);
            const contactSession = await getSession(contact);

            if (contactSession?.socketId) {
                send(contactSession.socketId);
            }
        }),
    );
};

export async function submitUserProfile(
    provider: ethers.providers.JsonRpcProvider,
    getSession: (accountAddress: string) => Promise<Session | null>,
    setSession: (accountAddress: string, session: Session) => Promise<void>,
    ensName: string,
    signedUserProfile: SignedUserProfile,
    getPendingConversations: (accountAddress: string) => Promise<string[]>,
    send: (socketId: string) => void,
): Promise<string> {
    const account = normalizeEnsName(ensName);

    if (!(await checkUserProfile(provider, signedUserProfile, account))) {
        logDebug('submitUserProfile - Signature invalid');
        throw Error('Signature invalid.');
    }
    //TODO:  remvoe DISABLE_SESSION_CHECK
    // DISABLE_SESSION_CHECK is a special solution for ETH Prague
    if (
        process.env.DISABLE_SESSION_CHECK !== 'true' &&
        (await getSession(account))
    ) {
        logDebug('submitUserProfile - Profile exists already');
        throw Error('Profile exists already');
    }
    const session: Session = {
        account,
        signedUserProfile,
        token: uuidv4(),
        createdAt: new Date().getTime(),
        profileExtension: getDefaultProfileExtension(),
    };
    logDebug({ text: 'submitUserProfile', session });
    await setSession(account.toLocaleLowerCase(), session);
    await handlePendingConversations(
        account,
        getSession,
        getPendingConversations,
        send,
    );

    return session.token;
}
export async function submitUserProfileSiwe(
    getSession: (accountAddress: string) => Promise<Session | null>,
    setSession: (accountAddress: string, session: Session) => Promise<void>,
    ensName: string,
    siwePayload: SiwePayload,
    getPendingConversations: (accountAddress: string) => Promise<string[]>,
    send: (socketId: string) => void,
): Promise<string> {
    const account = normalizeEnsName(ensName);
    //Check if the leftmost part of the account is the address of the carrier

    //First Check if SIWE has been signed by the address using ECRecoverey
    const isCorrectSiwe =
        ethers.utils.recoverAddress(
            ethers.utils.hashMessage(siwePayload.message),
            siwePayload.signature,
        ) === formatAddress(siwePayload.address);

    if (!isCorrectSiwe) {
        logDebug('submitUserProfile -SIWE Signature invalid');
        throw Error('SIWE Signature invalid.');
    }

    //Second Check if profile has been signed by carrier
    //We don't need to resolve the address as it is done during wallet signIn.
    //Instead we have to check if the carrier address is the same as the address in the signedUserProfile
    if (
        !(await checkUserProfileWithAddress(
            siwePayload.signedUserProfile,
            siwePayload.carrierAddress,
        ))
    ) {
        logDebug('submitUserProfile - Signature invalid');
        throw Error('Signature invalid.');
    }

    if (await getSession(account)) {
        logDebug('submitUserProfile - Profile exists already');
        throw Error('Profile exists already');
    }

    const session: Session = {
        account,
        signedUserProfile: siwePayload.signedUserProfile,
        token: uuidv4(),
        createdAt: new Date().getTime(),
        profileExtension: getDefaultProfileExtension(),
    };
    logDebug({ text: 'submitUserProfile', session });
    await setSession(account.toLocaleLowerCase(), session);
    await handlePendingConversations(
        account,
        getSession,
        getPendingConversations,
        send,
    );

    return session.token;
}

export async function getUserProfile(
    getSession: (accountAddress: string) => Promise<Session | null>,
    ensName: string,
): Promise<SignedUserProfile | undefined> {
    const account = normalizeEnsName(ensName);
    const session = await getSession(account);
    return session?.signedUserProfile;
}

export interface SiwePayload {
    address: string;
    message: string;
    signature: string;
    carrierAddress: string;
    signedUserProfile: SignedUserProfile;
}
