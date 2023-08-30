import './Chat.css';
import { Message } from '../Message/Message';
import { getConversation } from 'dm3-lib-storage';
import { globalConfig, log } from 'dm3-lib-shared';
import { MessageProps } from '../../interfaces/props';
import { useContext, useEffect, useState } from 'react';
import { GlobalContext } from '../../utils/context-utils';
import { MessageInput } from '../MessageInput/MessageInput';
import ConfigProfileAlertBox from '../ContactProfileAlertBox/ContactProfileAlertBox';
import {
    checkUserProfileConfigured,
    handleMessages,
    scrollToBottomOfChat,
} from './bl';

export function Chat() {
    const { state, dispatch } = useContext(GlobalContext);

    const [messageList, setMessageList] = useState([]);
    const [isProfileConfigured, setIsProfileConfigured] =
        useState<boolean>(false);

    const alias =
        state.connection.ethAddress &&
        state.connection.ethAddress + globalConfig.ADDR_ENS_SUBDOMAIN();

    const setProfileCheck = (status: boolean) => {
        setIsProfileConfigured(status);
    };

    const setListOfMessages = (msgs: []) => {
        setMessageList(msgs);
    };

    // handles messages list
    useEffect(() => {
        checkUserProfileConfigured(
            state,
            state.accounts.selectedContact?.account.ensName as string,
            setProfileCheck,
        );
        if (
            state.accounts.selectedContact &&
            state.userDb &&
            state.accounts.contacts
        ) {
            try {
                handleMessages(
                    state,
                    dispatch,
                    getConversation(
                        state.accounts.selectedContact.account.ensName,
                        state.accounts.contacts.map(
                            (contact) => contact.account,
                        ),
                        state.userDb,
                    ),
                    alias,
                    setListOfMessages,
                );
            } catch (error) {
                log(error, 'error');
            }
        }
    }, [state.userDb?.conversations, state.accounts.selectedContact]);

    // scrolls to bottom on any new message arrival
    useEffect(() => {
        scrollToBottomOfChat();
    }, [messageList]);

    return (
        <div
            className={
                state.accounts.selectedContact
                    ? 'highlight-chat-border'
                    : 'highlight-chat-border-none'
            }
        >
            <div className="m-2 text-primary-color position-relative chat-container">
                {/* To show information box that contact has not created profile */}
                {!isProfileConfigured && <ConfigProfileAlertBox />}

                {/* Chat messages */}
                <div
                    id="chat-box"
                    className={'chat-items position-relative'.concat(
                        ' ',
                        !isProfileConfigured
                            ? 'chat-height-small'
                            : 'chat-height-high',
                    )}
                >
                    {messageList.length > 0 &&
                        messageList.map((messageData: MessageProps, index) => (
                            <div key={index} className="mt-2">
                                {messageData.message && (
                                    <Message {...messageData} />
                                )}
                            </div>
                        ))}
                    <br />
                </div>

                {/* Message, emoji and file attachments */}
                <MessageInput />
            </div>
        </div>
    );
}
