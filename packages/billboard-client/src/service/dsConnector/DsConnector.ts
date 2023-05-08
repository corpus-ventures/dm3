import { decryptAsymmetric } from 'dm3-lib-crypto';
import { EncryptionEnvelop, Message } from 'dm3-lib-messaging';
import {
    DeliveryServiceProfile,
    ProfileKeys,
    SignedUserProfile,
} from 'dm3-lib-profile';
import { log } from 'dm3-lib-shared';
import { ethers } from 'ethers';
import { Socket } from 'socket.io-client';
import { IDatabase } from '../../persitance/getDatabase';
import { establishWsConnections } from './steps/establishWsConnection';
import { fetchAndStoreInitialMessages } from './steps/fetchAndStoreInitialMessages';
import { getBillboardProfile } from './steps/getBillboardProfile';
import { getDsProfile } from './steps/getDsProfile';
import { signInAtDs } from './steps/signInAtDs';

export interface Billboard {
    ensName: string;
    privateKey: string;
}

export type BillboardWithProfile = Billboard &
    SignedUserProfile & { profileKeys: ProfileKeys };
export type BillboardWithDsProfile = BillboardWithProfile & {
    dsProfile: DeliveryServiceProfile[];
};
export type AuthenticatedBillboard = BillboardWithDsProfile & {
    dsProfile: (DeliveryServiceProfile & { token: string })[];
};
export type AuthenticatedBillboardWithSocket = AuthenticatedBillboard & {
    dsProfile: (DeliveryServiceProfile & {
        token: string;
        socket: Socket;
    })[];
};

/**
Creates a delivery service connector.
@param db - The database instance.
@param provider - The JSON-RPC provider.
@param billboards - An array of Billboard
@returns An object with connect and disconnect methods.
*/
export function dsConnector(
    db: IDatabase,
    provider: ethers.providers.JsonRpcProvider,
    billboards: Billboard[],
) {
    let _connectedBillboards: AuthenticatedBillboardWithSocket[] = [];

    /**
Initializes the connection to delivery services.
@returns A promise that resolves when the connection initialization is complete.
*/
    async function connect() {
        log('Start to initialize connection to delivery services');
        //Get all delivery service profiles
        const billboardsWithProfile = await getBillboardProfile(
            provider,
            billboards,
        );

        //Get all delivery service profiles
        const billboardsWithDsProfile = await Promise.all(
            billboardsWithProfile.map(getDsProfile(provider)),
        );
        //For each delivery service profile we've to exercise the login flow
        const authenticatedBillboards = await signInAtDs(
            billboardsWithDsProfile,
        );

        //Fetch initial messages from every DS
        await fetchAndStoreInitialMessages(
            authenticatedBillboards,
            encryptAndStoreMessage,
        );

        //For each billboard and their delivryServices we establish a websocket connection
        _connectedBillboards = await establishWsConnections(
            authenticatedBillboards,
            encryptAndStoreMessage,
        );
        log('Finished delivery service initialization');
    }

    /** 
Disconnects all connected billboards by closing their associated sockets.
*/
    function disconnect() {
        _connectedBillboards.forEach((billboard) => {
            billboard.dsProfile.forEach(
                (ds: DeliveryServiceProfile & { socket: Socket }) => {
                    ds.socket.close();
                },
            );
        });
    }

    /**
Encrypts and stores a message to redis using the provided billboard's keypairs and encryption envelope.
@param billboardWithDsProfile - The billboard with delivery service profile.
@param encryptionEnvelop - The encryption envelope containing the message.
@returns A promise that resolves when the message has been encrypted and stored.
@throws If there is an error decrypting the message.
*/
    async function encryptAndStoreMessage(
        billboardWithDsProfile: BillboardWithDsProfile,
        encryptionEnvelop: EncryptionEnvelop,
    ) {
        try {
            const decryptedMessage = JSON.parse(
                await decryptAsymmetric(
                    billboardWithDsProfile.profileKeys.encryptionKeyPair,
                    JSON.parse(encryptionEnvelop.message),
                ),
            ) as Message;
            await db.createMessage(
                billboardWithDsProfile.ensName,
                decryptedMessage,
            );
        } catch (err: any) {
            log("Can't decrypt message");
            log(err);
        }
    }

    return { connect, disconnect };
}
