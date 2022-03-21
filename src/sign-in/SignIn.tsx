import React, { useState } from 'react';
import { ethers } from 'ethers';
import Icon from '../ui-shared/Icon';
import * as Lib from '../lib';
import StorageLocationSelection from './StorageLocationSelection';
import { connectionPhase } from './Phases';
import TokenInput from './TokenInput';

interface SignInProps {
    connection: Lib.Connection;
    changeConnection: (newConnection: Partial<Lib.Connection>) => void;
    setEnsNames: (ensNames: Map<string, string>) => void;
    ensNames: Map<string, string>;
    setSynced: (isSynced: boolean) => void;
    existingAccount: boolean;
    setExistingAccount: (exists: boolean) => void;
}

function SignIn(props: SignInProps) {
    const [dataFile, setDataFile] = useState<string | undefined>();
    const [token, setToken] = useState<string | undefined>();
    const [storageLocation, setStorageLocation] = useState<Lib.StorageLocation>(
        Lib.StorageLocation.File,
    );

    const connect = async () => {
        props.changeConnection({
            connectionState: Lib.ConnectionState.WaitingForAccountConntection,
        });
        const accountConnection = await Lib.connectAccount(
            props.connection.provider as ethers.providers.JsonRpcProvider,
        );

        props.setExistingAccount(accountConnection.existingAccount);

        if (accountConnection.account) {
            props.changeConnection({
                account: {
                    address: accountConnection.account,
                },
                connectionState: accountConnection.connectionState,
            });

            const ensName = await Lib.lookupAddress(
                props.connection.provider as ethers.providers.JsonRpcProvider,
                accountConnection.account,
            );
            if (ensName) {
                props.setEnsNames(
                    new Map(
                        props.ensNames.set(accountConnection.account, ensName),
                    ),
                );
            }
        } else {
            props.changeConnection({
                connectionState: accountConnection.connectionState,
            });
        }
    };

    const requestSignIn = async () => {
        props.changeConnection({
            connectionState: Lib.ConnectionState.WaitingForSignIn,
        });

        const data =
            storageLocation === Lib.StorageLocation.Web3Storage
                ? props.existingAccount
                    ? await Lib.web3Load(token as string)
                    : undefined
                : dataFile;

        const singInRequest = await Lib.signIn(
            props.connection,
            [props.setSynced],
            data,
        );

        if (singInRequest.db) {
            Lib.log(`Setting session token`);

            const account: Lib.Account = {
                address: props.connection.account?.address as string,
            };

            account.publicKeys = Lib.extractPublicKeys(singInRequest.db.keys);

            props.changeConnection({
                storageToken: token,
                storageLocation,
                db: singInRequest.db,
                account,
                connectionState: singInRequest.connectionState,
            });
        } else {
            props.changeConnection({
                connectionState: singInRequest.connectionState,
            });
        }
    };

    const getConnectionIconClass = (connectionState: Lib.ConnectionState) => {
        switch (connectionState) {
            case Lib.ConnectionState.AccountConnectionRejected:
                return <Icon iconClass="fas fa-exclamation-circle" />;

            case Lib.ConnectionState.WaitingForAccountConntection:
                return <Icon iconClass="fas fa-spinner fa-spin" />;

            case Lib.ConnectionState.SignInFailed:
            case Lib.ConnectionState.SignedIn:
            case Lib.ConnectionState.WaitingForSignIn:
            case Lib.ConnectionState.SignInReady:
                return <Icon iconClass="fas fa-check-circle" />;

            default:
                return null;
        }
    };

    const getSignInIconClass = (connectionState: Lib.ConnectionState) => {
        switch (connectionState) {
            case Lib.ConnectionState.SignInFailed:
                return <Icon iconClass="fas fa-exclamation-circle" />;
            case Lib.ConnectionState.SignedIn:
                return <Icon iconClass="fas fa-check-circle" />;
            case Lib.ConnectionState.WaitingForSignIn:
                return <Icon iconClass="fas fa-spinner fa-spin" />;
            default:
                return null;
        }
    };

    const upload = (event: any) => {
        if (event.target.files[0]) {
            const file = event.target.files[0];
            const reader = new FileReader();
            reader.onload = (e) => {
                if (e.target) {
                    setDataFile(e.target?.result as string);
                }
            };
            reader.readAsText(file);
        }
    };

    return (
        <div className="w-100">
            <div className="row d-flex justify-content-center ">
                <div className="col-md-12 row-space">
                    <div className="row">
                        <div className="col-md-12">
                            <button
                                onClick={connect}
                                type="button"
                                className={`btn btn-${
                                    props.connection.connectionState ===
                                    Lib.ConnectionState
                                        .AccountConnectionRejected
                                        ? 'danger'
                                        : 'primary'
                                } btn-lg w-100`}
                                disabled={
                                    !(
                                        props.connection.connectionState ===
                                            Lib.ConnectionState
                                                .AccountConntectReady ||
                                        props.connection.connectionState ===
                                            Lib.ConnectionState
                                                .AccountConnectionRejected
                                    )
                                }
                            >
                                Connect Account
                                <span className="push-end">
                                    {getConnectionIconClass(
                                        props.connection.connectionState,
                                    )}
                                </span>
                            </button>
                        </div>
                    </div>

                    {!connectionPhase(props.connection.connectionState) && (
                        <StorageLocationSelection
                            setStorageLocation={setStorageLocation}
                            stroageLocation={storageLocation}
                        />
                    )}
                    {props.existingAccount &&
                        storageLocation === Lib.StorageLocation.File && (
                            <div className="row row-space">
                                <div className="col-md-12">
                                    <input
                                        type="file"
                                        className="form-control"
                                        onChange={(event) => upload(event)}
                                    />
                                </div>
                            </div>
                        )}
                    {!connectionPhase(props.connection.connectionState) &&
                        storageLocation === Lib.StorageLocation.Web3Storage && (
                            <TokenInput setToken={setToken} token={token} />
                        )}
                    {!connectionPhase(props.connection.connectionState) && (
                        <div className="row row-space">
                            <div className="col-md-12">
                                <button
                                    onClick={requestSignIn}
                                    type="button"
                                    className={`btn btn-${
                                        props.connection.connectionState ===
                                        Lib.ConnectionState.SignInFailed
                                            ? 'danger'
                                            : 'primary'
                                    } btn-lg w-100`}
                                    disabled={
                                        !(
                                            props.connection.connectionState ===
                                                Lib.ConnectionState
                                                    .SignInReady ||
                                            props.connection.connectionState ===
                                                Lib.ConnectionState.SignInFailed
                                        ) ||
                                        (props.existingAccount &&
                                            !dataFile &&
                                            storageLocation ===
                                                Lib.StorageLocation.File) ||
                                        (props.existingAccount &&
                                            !token &&
                                            storageLocation ===
                                                Lib.StorageLocation.Web3Storage)
                                    }
                                >
                                    Sign In
                                    <span className="push-end">
                                        {getSignInIconClass(
                                            props.connection.connectionState,
                                        )}
                                    </span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default SignIn;
