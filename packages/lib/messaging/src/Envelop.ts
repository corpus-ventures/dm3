import { EncryptAsymmetric, encryptAsymmetric, sign } from 'dm3-lib-crypto';
import { sha256, stringify } from 'dm3-lib-shared';
import { Message, Postmark, SendDependencies } from './Message';
import { ethers } from 'ethers';
import {
    Account,
    DeliveryServiceProfile,
    GetResource,
    ProfileExtension,
    ProfileKeys,
    getDeliveryServiceProfile,
    getUserProfile,
} from 'dm3-lib-profile';

export interface EnvelopeMetadata {
    version: string;
    encryptionScheme?: string;
    deliveryInformation: string | DeliveryInformation;
    encryptedMessageHash: string;
    signature: string;
}

export interface EncryptionEnvelop {
    message: string;
    metadata: EnvelopeMetadata;
    postmark?: string;
}

export interface Envelop {
    message: Message;
    metadata?: EnvelopeMetadata;
    postmark?: Postmark;
    id?: string;
}

export interface DeliveryInformation {
    to: string;
    from: string;
    deliveryInstruction?: string;
}

export async function createEnvelop(
    message: Message,
    provider: ethers.providers.JsonRpcProvider,
    keys: ProfileKeys,
    getRessource: GetResource<DeliveryServiceProfile>,
    sendDependenciesCache?: Partial<SendDependencies>,
): Promise<{ encryptedEnvelop: EncryptionEnvelop; envelop: Envelop }> {
    const to = sendDependenciesCache?.to ?? {
        ensName: message.metadata.to,
        profile: (await getUserProfile(provider, message.metadata.to))?.profile,
    };

    if (!to.profile) {
        throw Error(`No profile for ${to.ensName}`);
    }

    const deliveryServiceEncryptionPubKey =
        sendDependenciesCache?.deliveryServiceEncryptionPubKey ??
        (
            await getDeliveryServiceProfile(
                to.profile.deliveryServices[0],
                provider,
                getRessource,
            )
        )?.publicEncryptionKey;

    if (!deliveryServiceEncryptionPubKey) {
        throw Error(`Couldn't get delivery service encryption key`);
    }
    const sendDependencies: SendDependencies = {
        to,

        from: sendDependenciesCache?.from ?? {
            ensName: message.metadata.from,
            profile: (await getUserProfile(provider, message.metadata.from))
                ?.profile,
        },
        deliveryServiceEncryptionPubKey,
        keys,
    };

    return buildEnvelop(message, encryptAsymmetric, sendDependencies);
}

export async function buildEnvelop(
    message: Message,
    encryptAsymmetric: EncryptAsymmetric,
    { to, from, deliveryServiceEncryptionPubKey, keys }: SendDependencies,
    preEncryptedMessage?: string,
): Promise<{ encryptedEnvelop: EncryptionEnvelop; envelop: Envelop }> {
    if (!to.profile) {
        throw Error('Contact has no profile');
    }
    /**
     * Encrypts a message using the receivers public encryptionKey
     */
    const encryptedMessage =
        preEncryptedMessage ??
        stringify(
            await encryptAsymmetric(
                to.profile.publicEncryptionKey,
                stringify(message),
            ),
        );

    const deliveryInformation: DeliveryInformation = {
        to: to.ensName,
        from: from.ensName,
    };
    /**
     * Builds the {@see EnvelopMetadata} for the message
     * and encrypts the {@see DeliveryInformation} using the deliveryServiceEncryptionPubKey
     * the encryptedMessageHash field is mendatory to establish a link between the message and metadata
     */
    const envelopeMetadata: Omit<EnvelopeMetadata, 'signature'> = {
        encryptionScheme: 'x25519-chacha20-poly1305',
        deliveryInformation: stringify(
            await encryptAsymmetric(
                deliveryServiceEncryptionPubKey,
                stringify(deliveryInformation),
            ),
        ),
        encryptedMessageHash: sha256(stringify(encryptedMessage)),
        version: 'v1',
    };

    /**
     * Signes the Metadata of the envelop using the senders privateKey
     */
    const metadata = {
        ...envelopeMetadata,
        signature: await sign(
            keys.signingKeyPair.privateKey,
            stringify(envelopeMetadata),
        ),
    };

    return {
        encryptedEnvelop: {
            message: encryptedMessage,
            metadata,
        },
        envelop: {
            message,
            metadata: { ...metadata, deliveryInformation },
        },
    };
}
