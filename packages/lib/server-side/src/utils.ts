/* eslint-disable no-console */
import { checkToken } from '@dm3-org/dm3-lib-delivery';
import {
    DeliveryServiceProfileKeys,
    normalizeEnsName,
} from '@dm3-org/dm3-lib-profile';
import { ethers } from 'ethers';
import { NextFunction, Request, Response } from 'express';
import { Socket } from 'socket.io';
import { ExtendedError } from 'socket.io/dist/namespace';
import winston from 'winston';
import type { ISessionDatabase } from './iSessionDatabase';

export async function auth(
    req: Request,
    res: Response,
    next: NextFunction,
    ensName: string,
    db: ISessionDatabase,
    web3Provider: ethers.providers.JsonRpcProvider,
    serverSecret: string,
) {
    const normalizedEnsName = normalizeEnsName(ensName);
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    //TODO resolve addr for ens name
    if (
        token &&
        (await checkToken(
            web3Provider,
            db.getSession,
            normalizedEnsName,
            token,
            serverSecret,
        ))
    ) {
        next();
    } else {
        console.warn('AUTH Token check failed for ', normalizedEnsName);
        res.sendStatus(401);
    }
}

export function socketAuth(
    db: ISessionDatabase,
    web3Provider: ethers.providers.JsonRpcProvider,
    serverSecret: string,
) {
    return async (
        socket: Socket,
        next: (err?: ExtendedError | undefined) => void,
    ) => {
        try {
            const ensName = normalizeEnsName(
                socket.handshake.auth.account.ensName,
            );
            console.log('Start WS auth for ', ensName, socket.id);

            if (
                !(await checkToken(
                    web3Provider,
                    db.getSession,
                    ensName,
                    socket.handshake.auth.token as string,
                    serverSecret,
                ))
            ) {
                console.log('check token has failed for WS ');
                return next(new Error('check token has failed for WS'));
            }
            const session = await db.getSession(ensName);
            if (!session) {
                throw Error('Could not get session');
            }

            await db.setSession(ensName, {
                ...session,
                socketId: socket.id,
            });
        } catch (e) {
            console.log('socket auth error');
            console.log(e);
            next(e as Error);
        }

        next();
    };
}

export function logRequest(req: Request, res: Response, next: NextFunction) {
    winston.loggers.get('default').info({
        method: req.method,
        url: req.url,
        timestamp: new Date().getTime(),
    });
    next();
}

export function logError(
    error: Error,
    req: Request,
    res: Response,
    next: NextFunction,
) {
    winston.loggers.get('default').error({
        method: req.method,
        url: req.url,
        error: error.toString(),
        timestamp: new Date().getTime(),
    });
    next();
}

export function errorHandler(
    err: any,
    req: Request,
    res: Response,
    next: NextFunction,
) {
    res.status(500);
    res.render('error', { error: err });
}

export function readKeysFromEnv(
    env: NodeJS.ProcessEnv,
): DeliveryServiceProfileKeys {
    const readKey = (keyName: string) => {
        const key = env[keyName];
        if (!key) {
            throw Error(`Missing ${keyName} in env`);
        }

        return key;
    };

    return {
        signingKeyPair: {
            publicKey: readKey('SIGNING_PUBLIC_KEY'),
            privateKey: readKey('SIGNING_PRIVATE_KEY'),
        },
        encryptionKeyPair: {
            publicKey: readKey('ENCRYPTION_PUBLIC_KEY'),
            privateKey: readKey('ENCRYPTION_PRIVATE_KEY'),
        },
    };
}

/**
 * The server secret is used to sign jwt. It is generated by hashing the secret signing key.
 * @param env environment containing config values
 * @returns server secret
 */
export function getServerSecret(env: NodeJS.ProcessEnv): string {
    try {
        const keys = readKeysFromEnv(env);
        const secretInput = keys.signingKeyPair.privateKey;
        const secret = ethers.utils.sha256(
            ethers.utils.base64.decode(secretInput),
        );
        if (!secret) {
            throw Error('Failed to load server secret for jwt');
        }

        return secret;
    } catch (e) {
        throw Error('Could not get server secret');
    }
}
