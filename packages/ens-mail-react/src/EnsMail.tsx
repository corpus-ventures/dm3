import React, { useEffect, useContext } from 'react';
import './EnsMail.css';
import 'react-chat-widget/lib/styles.css';
import detectEthereumProvider from '@metamask/detect-provider';
import socketIOClient from 'socket.io-client';
import * as Lib from 'ens-mail-lib';
import { requestContacts } from './ui-shared/RequestContacts';
import LeftView from './LeftView';
import RightView from './RightView';
import { useBeforeunload } from 'react-beforeunload';
import { GlobalContext } from './GlobalContextProvider';
import { AccountsType } from './reducers/Accounts';
import { UserDbType } from './reducers/UserDB';
import { ConnectionType } from './reducers/Connection';
import { showSignIn } from './sign-in/Phases';
import SignIn from './sign-in/SignIn';
import { CacheType } from './reducers/Cache';
import { UiStateType } from './reducers/UiState';
import Start from './start/Start';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap/dist/js/bootstrap.bundle.min.js';
import { Config } from './utils/Config';

interface EnsMailProps {
    config: Config;
}

function EnsMail(props: EnsMailProps) {
    const { state, dispatch } = useContext(GlobalContext);

    if (state.userDb?.synced) {
        useBeforeunload();
    } else {
        useBeforeunload(
            () =>
                "The app is out of sync with the database. You'll loose your new messages.",
        );
    }

    useEffect(() => {
        if (
            props.config.showContacts === false &&
            state.accounts.selectedContact
        ) {
            dispatch({
                type: UiStateType.SetMaxLeftView,
                payload: false,
            });
        }
    }, [state.accounts.selectedContact]);

    const getContacts = (connection: Lib.Connection) => {
        if (!state.userDb) {
            throw Error(
                `[getContacts] Couldn't handle new messages. User db not created.`,
            );
        }

        return requestContacts(
            connection,
            state.accounts.selectedContact,
            (contact: Lib.Account | undefined) =>
                dispatch({
                    type: AccountsType.SetSelectedContact,
                    payload: contact,
                }),
            (contacts: Lib.Account[]) =>
                dispatch({ type: AccountsType.SetContacts, payload: contacts }),
            (address: string, name: string) =>
                dispatch({
                    type: CacheType.AddEnsName,
                    payload: {
                        address,
                        name,
                    },
                }),
            state.userDb,
            (id: string) =>
                dispatch({
                    type: UserDbType.createEmptyConversation,
                    payload: id,
                }),
            (conversations) =>
                conversations.forEach((conversation) =>
                    dispatch({
                        type: UserDbType.addMessage,
                        payload: {
                            container: conversation,
                            connection: connection,
                        },
                    }),
                ),
            props.config.defaultContact,
        );
    };

    const handleNewMessage = async (envelop: Lib.EncryptionEnvelop) => {
        Lib.log('New messages');

        const innerEnvelop = Lib.decryptEnvelop(
            state.userDb as Lib.UserDB,
            envelop,
        );

        if (!state.userDb) {
            throw Error(
                `[handleNewMessage] Couldn't handle new messages. User db not created.`,
            );
        }

        if (!envelop.deliveryServiceIncommingTimestamp) {
            throw Error(`[handleNewMessage] No delivery service timestamp`);
        }

        dispatch({
            type: UserDbType.addMessage,
            payload: {
                container: {
                    envelop: innerEnvelop,
                    messageState: Lib.MessageState.Send,
                    deliveryServiceIncommingTimestamp:
                        envelop.deliveryServiceIncommingTimestamp,
                },
                connection: state.connection as Lib.Connection,
            },
        });
    };

    useEffect(() => {
        if (
            state.connection.connectionState === Lib.ConnectionState.SignedIn &&
            !state.connection.socket
        ) {
            if (!state.userDb) {
                throw Error(
                    `Couldn't handle new messages. User db not created.`,
                );
            }

            const socket = socketIOClient(
                process.env.REACT_APP_BACKEND as string,
                { autoConnect: false },
            );
            socket.auth = {
                account: state.connection.account,
                token: state.userDb.deliveryServiceToken,
            };
            socket.connect();
            socket.on('message', (envelop: Lib.EncryptionEnvelop) => {
                handleNewMessage(envelop);
            });
            socket.on('joined', () => {
                getContacts(state.connection as Lib.Connection);
            });
            dispatch({ type: ConnectionType.ChangeSocket, payload: socket });
        }
    }, [state.connection.connectionState, state.connection.socket]);

    useEffect(() => {
        if (state.accounts.selectedContact && state.connection.socket) {
            state.connection.socket.removeAllListeners();

            state.connection.socket.on(
                'message',
                (envelop: Lib.EncryptionEnvelop) => {
                    handleNewMessage(envelop);
                },
            );

            state.connection.socket.on('joined', () => {
                getContacts(state.connection as Lib.Connection);
            });
        }
    }, [
        state.accounts.selectedContact,
        state.accounts.selectedContact,
        state.userDb?.conversations,
    ]);

    const createWeb3Provider = async () => {
        const web3Provider = await Lib.getWeb3Provider(
            await detectEthereumProvider(),
        );

        if (web3Provider.provider) {
            dispatch({
                type: ConnectionType.ChangeProvider,
                payload: web3Provider.provider,
            });
        }

        dispatch({
            type: ConnectionType.ChangeConnectionState,
            payload: web3Provider.connectionState,
        });
    };

    useEffect(() => {
        if (!state.connection.provider) {
            createWeb3Provider();
        }
    }, [state.connection.provider]);

    const mainContent = (
        <div className="row main-content-row" style={props.config.style}>
            <div className="col-12 h-100">
                {/* <Header /> */}
                <div className="row h-100">
                    {showSignIn(state.connection.connectionState) ? (
                        <SignIn />
                    ) : (
                        <>
                            <LeftView getContacts={getContacts} />
                            <RightView />
                        </>
                    )}
                </div>
            </div>
        </div>
    );

    return props.config.inline ? (
        mainContent
    ) : (
        <>
            {state.uiState.show && (
                <div className="filler">
                    <div className="container">{mainContent}</div>
                </div>
            )}
            <Start />
        </>
    );
}

export default EnsMail;
