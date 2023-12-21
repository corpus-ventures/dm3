import { checkSignature as _checkSignature } from 'dm3-lib-crypto';
import { Message, MessageState } from 'dm3-lib-messaging';
import {
    Account,
    getUserProfile,
    isSameEnsName,
    normalizeEnsName,
} from 'dm3-lib-profile';
import { globalConfig, log, stringify } from 'dm3-lib-shared';
import {
    Actions,
    CacheType,
    GlobalState,
    MessageActionType,
    UserDbType,
} from '../../utils/enum-type-utils';
import {
    StorageEnvelopContainer,
    UserDB,
    getConversation,
} from 'dm3-lib-storage';
import { MessageProps } from '../../interfaces/props';
import { fetchAndStoreMessages } from '../../adapters/messages';
import { ethers } from 'ethers';

// method to check message signature
export async function checkSignature(
    message: Message,
    publicSigningKey: string,
    ensName: string,
    signature: string,
): Promise<boolean> {
    const sigCheck = await _checkSignature(
        publicSigningKey,
        stringify(message)!,
        signature,
    );

    if (
        sigCheck &&
        normalizeEnsName(ensName) !== normalizeEnsName(message.metadata.from)
    ) {
        return true;
    } else {
        log(`Signature check for ${ensName} failed.`, 'error');
        return false;
    }
}

// method to check user profile is configured or not
export const checkUserProfileConfigured = async (
    mainnetProvider: ethers.providers.StaticJsonRpcProvider,
    ensName: string,
    setProfileCheck: Function,
) => {
    try {
        const profileDetails = await getUserProfile(mainnetProvider, ensName);
        if (!profileDetails || !profileDetails.profile.publicEncryptionKey) {
            setProfileCheck(false);
        } else {
            setProfileCheck(true);
        }
    } catch (error) {
        setProfileCheck(false);
    }
    scrollToBottomOfChat();
};

// method to scroll down to latest message automatically
export const scrollToBottomOfChat = () => {
    const element: HTMLElement = document.getElementById(
        'chat-box',
    ) as HTMLElement;
    setTimeout(() => {
        if (element) {
            element.scroll({
                top: element.scrollHeight,
                behavior: 'smooth',
            });
        }
    }, 100);
};

// method to set message format
const handleMessageContainer = (
    state: GlobalState,
    account: Account,
    messageContainers: StorageEnvelopContainer[],
    alias: string | undefined,
    setListOfMessages: Function,
    dispatch: React.Dispatch<Actions>,
    hideFunction?: string,
) => {
    try {
        const msgList: MessageProps[] = [];
        let msg: MessageProps;
        let replyToEnvelop: StorageEnvelopContainer | undefined;
        let editedMessage: StorageEnvelopContainer | undefined;
        let deletedMessage: StorageEnvelopContainer | undefined;
        let reactionEnvelope: StorageEnvelopContainer[];
        const messagesMap = new Map<
            string,
            { msgDetails: MessageProps; index: number }
        >();

        const reactMessages: StorageEnvelopContainer[] =
            fetchAllReactionMessages(messageContainers);

        messageContainers.forEach((container: StorageEnvelopContainer) => {
            // fetch reply messages
            if (
                container.envelop.message.metadata.referenceMessageHash &&
                container.envelop.message.metadata.type ===
                    MessageActionType.REPLY
            ) {
                const data = messagesMap.get(
                    container.envelop.message.metadata.referenceMessageHash,
                );
                if (data) {
                    replyToEnvelop = data.msgDetails;
                }
            } else {
                replyToEnvelop = undefined;
            }

            // fetch edited messages
            if (
                container.envelop.message.metadata.referenceMessageHash &&
                container.envelop.message.metadata.type ===
                    MessageActionType.EDIT
            ) {
                const data = messagesMap.get(
                    container.envelop.message.metadata.referenceMessageHash,
                );
                if (data) {
                    editedMessage = container;
                }
            } else {
                editedMessage = undefined;
            }

            // fetch deleted messages
            if (
                container.envelop.message.metadata.referenceMessageHash &&
                container.envelop.message.metadata.type ===
                    MessageActionType.DELETE
            ) {
                const data = messagesMap.get(
                    container.envelop.message.metadata.referenceMessageHash,
                );
                if (data) {
                    deletedMessage = container;
                }
            } else {
                deletedMessage = undefined;
            }

            // set edited messages
            if (
                editedMessage &&
                editedMessage.envelop.message.metadata.referenceMessageHash
            ) {
                setEditedMessage(
                    account,
                    messagesMap,
                    editedMessage,
                    msgList,
                    replyToEnvelop,
                    state,
                    alias,
                    hideFunction,
                );
            } else if (
                deletedMessage &&
                deletedMessage.envelop.message.metadata.referenceMessageHash
            ) {
                // set deleted messages
                setDeletedMessage(
                    messagesMap,
                    deletedMessage,
                    msgList,
                    replyToEnvelop,
                    account,
                    alias,
                    hideFunction,
                );
            } else if (
                container.envelop.message.metadata.type !==
                MessageActionType.REACT
            ) {
                // fetch all reactions of a message
                reactionEnvelope = reactMessages.filter(
                    (data) =>
                        data.envelop.message.metadata.referenceMessageHash ===
                        container.envelop.metadata?.encryptedMessageHash,
                );

                // Set the message data
                msg = {
                    message: container.envelop.message.message!,
                    time: container.envelop.message.metadata.timestamp.toString(),
                    messageState: container.messageState,
                    ownMessage: false,
                    envelop: container.envelop,
                    replyToMsg: replyToEnvelop?.envelop.message.message,
                    replyToMsgFrom:
                        replyToEnvelop?.envelop.message.metadata.from,
                    replyToMsgId:
                        replyToEnvelop?.envelop.metadata?.encryptedMessageHash,
                    replyToMsgEnvelope: replyToEnvelop?.envelop,
                    reactions: reactionEnvelope.map((data) => data.envelop),
                    hideFunction: hideFunction,
                };
                if (
                    isSameEnsName(
                        container.envelop.message.metadata.from,
                        account.ensName,
                        alias,
                    )
                ) {
                    msg.ownMessage = true;
                }

                messagesMap.set(
                    msg.envelop.metadata?.encryptedMessageHash as string,
                    {
                        msgDetails: msg,
                        index: msgList.length,
                    },
                );
                msgList.push(msg);
            }
        });

        msgList.length && (msgList[msgList.length - 1].isLastMessage = true);
        setListOfMessages(msgList);

        if (msgList.length) {
            dispatch({
                type: CacheType.LastConversation,
                payload: {
                    account: state.accounts.selectedContact?.account
                        ? state.accounts.selectedContact?.account
                        : null,
                    message: msgList[msgList.length - 1].message.length
                        ? msgList[msgList.length - 1].message
                        : null,
                },
            });
        }
    } catch (error) {}
};

const setDeletedMessage = (
    messagesMap: Map<string, { msgDetails: MessageProps; index: number }>,
    deletedMessage: StorageEnvelopContainer,
    msgList: MessageProps[],
    replyToEnvelop: StorageEnvelopContainer | undefined,
    account: Account,
    alias: string | undefined,
    hideFunction?: string,
) => {
    if (
        deletedMessage &&
        deletedMessage.envelop.message.metadata.referenceMessageHash
    ) {
        const data = messagesMap.get(
            deletedMessage.envelop.message.metadata.referenceMessageHash,
        );
        if (data) {
            msgList[data.index].envelop = deletedMessage.envelop;
            msgList[data.index].message =
                deletedMessage.envelop.message.message!;
            msgList[data.index].time =
                deletedMessage.envelop.message.metadata.timestamp.toString();
            msgList[data.index].messageState = deletedMessage.messageState;
            msgList[data.index].ownMessage = false;
            msgList[data.index].envelop = deletedMessage.envelop;
            msgList[data.index].replyToMsg =
                replyToEnvelop?.envelop.message.message;
            msgList[data.index].replyToMsgFrom =
                replyToEnvelop?.envelop.message.metadata.from;
            msgList[data.index].replyToMsgId =
                replyToEnvelop?.envelop.metadata?.encryptedMessageHash;
            msgList[data.index].reactions = [];
            msgList[data.index].hideFunction = hideFunction;
            if (
                isSameEnsName(
                    deletedMessage.envelop.message.metadata.from,
                    account.ensName,
                    alias,
                )
            ) {
                msgList[data.index].ownMessage = true;
            }
            messagesMap.set(
                deletedMessage.envelop.metadata?.encryptedMessageHash as string,
                {
                    msgDetails: msgList[data.index],
                    index: data.index,
                },
            );
        }
    }
};

const setEditedMessage = (
    dm3UserAccount: Account,
    messagesMap: Map<string, { msgDetails: MessageProps; index: number }>,
    editedMessage: StorageEnvelopContainer,
    msgList: MessageProps[],
    replyToEnvelop: StorageEnvelopContainer | undefined,
    state: GlobalState,
    alias: string | undefined,
    hideFunction?: string,
) => {
    if (
        editedMessage &&
        editedMessage.envelop.message.metadata.referenceMessageHash
    ) {
        const data = messagesMap.get(
            editedMessage.envelop.message.metadata.referenceMessageHash,
        );
        if (data) {
            msgList[data.index].envelop = editedMessage.envelop;
            msgList[data.index].message =
                editedMessage.envelop.message.message!;
            msgList[data.index].time =
                editedMessage.envelop.message.metadata.timestamp.toString();
            msgList[data.index].messageState = editedMessage.messageState;
            msgList[data.index].ownMessage = false;
            msgList[data.index].envelop = editedMessage.envelop;
            msgList[data.index].replyToMsg =
                replyToEnvelop?.envelop.message.message;
            msgList[data.index].replyToMsgFrom =
                replyToEnvelop?.envelop.message.metadata.from;
            msgList[data.index].replyToMsgId =
                replyToEnvelop?.envelop.metadata?.encryptedMessageHash;
            msgList[data.index].reactions = [];
            msgList[data.index].hideFunction = hideFunction;
            if (
                isSameEnsName(
                    editedMessage.envelop.message.metadata.from,
                    dm3UserAccount.ensName,
                    alias,
                )
            ) {
                msgList[data.index].ownMessage = true;
            }
            messagesMap.set(
                editedMessage.envelop.metadata?.encryptedMessageHash as string,
                {
                    msgDetails: msgList[data.index],
                    index: data.index,
                },
            );
        }
    }
};

const fetchAllReactionMessages = (
    messageContainers: StorageEnvelopContainer[],
): StorageEnvelopContainer[] => {
    const deletedMsgs: string[] = [];

    // Filter put all reaction messages
    const allReactionMessages = messageContainers.filter(
        (data) =>
            data.envelop.message.metadata.type === MessageActionType.REACT,
    );

    // Filter out the deleted reaction messages
    [...allReactionMessages].reverse().forEach((data) => {
        const deletedReactionMsgs = allReactionMessages.filter(
            (item) =>
                item.envelop.metadata?.encryptedMessageHash ===
                data.envelop.message.metadata.referenceMessageHash,
        );
        if (deletedReactionMsgs.length) {
            deletedMsgs.push(
                deletedReactionMsgs[0].envelop.metadata
                    ?.encryptedMessageHash as string,
            );
            deletedMsgs.push(
                deletedReactionMsgs[0].envelop.metadata
                    ?.encryptedMessageHash as string,
            );
        }
    });

    // Filter out non deleted reaction messages
    const nonDeletedReactionMessages: StorageEnvelopContainer[] =
        allReactionMessages.filter(
            (data) =>
                !deletedMsgs.includes(
                    data.envelop.metadata?.encryptedMessageHash as string,
                ),
        );
    return nonDeletedReactionMessages;
};

// method to set the message list
export const handleMessages = async (
    state: GlobalState,
    mainnetProvider: ethers.providers.StaticJsonRpcProvider,
    dm3UserAccount: Account,
    dsToken: string,
    dispatch: React.Dispatch<Actions>,
    containers: StorageEnvelopContainer[],
    alias: string | undefined,
    setListOfMessages: Function,
    isMessageListInitialized: boolean,
    updateIsMessageListInitialized: Function,
    updateShowShimEffect: Function,
    hideFunction?: string,
) => {
    if (!isMessageListInitialized && state.accounts.selectedContact) {
        const fetchedMessages = await fetchAndStoreMessages(
            mainnetProvider,
            dm3UserAccount,
            dsToken,
            state.accounts.selectedContact.account.ensName,
            state.userDb as UserDB,
            (envelops) => {
                envelops.forEach((envelop) =>
                    dispatch({
                        type: UserDbType.addMessage,
                        payload: {
                            container: envelop,
                            account: dm3UserAccount,
                        },
                    }),
                );
            },
            state.accounts.contacts
                ? state.accounts.contacts.map((contact) => contact.account)
                : [],
        );

        const addressMessages = await getOldMessages(
            mainnetProvider,
            state,
            dm3UserAccount,
            alias,
        );
        const items = [...addressMessages, ...fetchedMessages];

        const checkedContainers = items.filter((container) => {
            if (!state.accounts.selectedContact) {
                throw Error('No selected contact');
            }

            const account = isSameEnsName(
                container.envelop.message.metadata.from,
                state.accounts.selectedContact.account.ensName,
                alias,
            )
                ? state.accounts.selectedContact.account
                : dm3UserAccount;

            return account.profile?.publicSigningKey
                ? checkSignature(
                      container.envelop.message,
                      account.profile?.publicSigningKey,
                      account.ensName,
                      container.envelop.message.signature,
                  )
                : true;
        });

        const newMessages = checkedContainers
            .filter((container) => container.messageState === MessageState.Send)
            .map((container) => ({
                ...container,
                messageState: MessageState.Read,
            }));

        const oldMessages = checkedContainers.filter(
            (container) =>
                container.messageState === MessageState.Read ||
                container.messageState === MessageState.Created,
        );

        handleMessageContainer(
            state,
            dm3UserAccount,
            oldMessages,
            alias,
            setListOfMessages,
            dispatch,
            hideFunction,
        );

        if (!state.userDb) {
            throw Error(
                `[handleMessages] Couldn't handle new messages. User db not created.`,
            );
        }

        if (newMessages.length > 0) {
            newMessages.forEach((message) =>
                dispatch({
                    type: UserDbType.addMessage,
                    payload: {
                        container: message,
                        account: dm3UserAccount,
                    },
                }),
            );
        }

        if (!isMessageListInitialized) {
            scrollToBottomOfChat();
            updateIsMessageListInitialized(true);
        }

        updateShowShimEffect(false);
    } else {
        const checkedContainers = containers.filter((container) => {
            if (!state.accounts.selectedContact) {
                throw Error('No selected contact');
            }

            const account = isSameEnsName(
                container.envelop.message.metadata.from,
                state.accounts.selectedContact.account.ensName,
                alias,
            )
                ? state.accounts.selectedContact.account
                : dm3UserAccount;

            return account.profile?.publicSigningKey
                ? checkSignature(
                      container.envelop.message,
                      account.profile?.publicSigningKey,
                      account.ensName,
                      container.envelop.message.signature,
                  )
                : true;
        });

        const newMessages = checkedContainers
            .filter((container) => container.messageState === MessageState.Send)
            .map((container) => ({
                ...container,
                messageState: MessageState.Read,
            }));

        const oldMessages = checkedContainers.filter(
            (container) =>
                container.messageState === MessageState.Read ||
                container.messageState === MessageState.Created,
        );

        handleMessageContainer(
            state,
            dm3UserAccount,
            oldMessages,
            alias,
            setListOfMessages,
            dispatch,
            hideFunction,
        );

        if (!state.userDb) {
            throw Error(
                `[handleMessages] Couldn't handle new messages. User db not created.`,
            );
        }

        if (newMessages.length > 0) {
            newMessages.forEach((message) =>
                dispatch({
                    type: UserDbType.addMessage,
                    payload: {
                        container: message,
                        account: dm3UserAccount,
                    },
                }),
            );
        }

        if (!isMessageListInitialized) {
            scrollToBottomOfChat();
            updateIsMessageListInitialized(true);
        }

        updateShowShimEffect(false);
    }
};

const getOldMessages = async (
    mainnetProvider: ethers.providers.StaticJsonRpcProvider,
    state: GlobalState,
    dm3UserAccount: Account,
    alias: string | undefined,
) => {
    let address: string | null | undefined = null;

    try {
        if (
            state.accounts.selectedContact &&
            state.userDb &&
            state.accounts.contacts
        ) {
            // check if it is not the address
            const isAddrEnsName =
                state.accounts.selectedContact.account.ensName.endsWith(
                    globalConfig.ADDR_ENS_SUBDOMAIN(),
                );

            if (!isAddrEnsName) {
                // fetch the address of contact

                address = await mainnetProvider?.resolveName(
                    state.accounts.selectedContact.account.ensName,
                );

                // get address ENS name
                if (address) {
                    address = address.concat(globalConfig.ADDR_ENS_SUBDOMAIN());

                    // fetch all old messages from address
                    const containers = getConversation(
                        address,
                        state.accounts.contacts.map(
                            (contact) => contact.account,
                        ),
                        state.userDb,
                    );

                    const checkedContainers = containers.filter((container) => {
                        if (!state.accounts.selectedContact) {
                            return [];
                        }

                        const account = isSameEnsName(
                            container.envelop.message.metadata.from,
                            address as string,
                            alias,
                        )
                            ? state.accounts.selectedContact.account
                            : dm3UserAccount;

                        return account.profile?.publicSigningKey
                            ? checkSignature(
                                  container.envelop.message,
                                  account.profile?.publicSigningKey,
                                  account.ensName,
                                  container.envelop.message.signature,
                              )
                            : true;
                    });

                    return checkedContainers;
                } else {
                    return [];
                }
            } else {
                return [];
            }
        } else {
            return [];
        }
    } catch (error) {
        return [];
    }
};
