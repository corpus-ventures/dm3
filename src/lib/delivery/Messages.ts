import { formatAddress } from '../external-apis/InjectedWeb3API';
import { log } from '../shared/log';
import { EncryptionEnvelop } from '../messaging/Messaging';
import { getConversationId } from '../storage/Storage';
import { checkToken, Session } from './Session';

export interface Acknoledgment {
    contactAddress: string;
    messageDeliveryServiceTimestamp: number;
}

// fetch new messages
export function getMessages(
    sessions: Map<string, Session>,
    messages: Map<string, EncryptionEnvelop[]>,
    accountAddress: string,
    contactAddress: string,
    token: string,
) {
    log(`[getMessages]`);

    const account = formatAddress(accountAddress);
    const contact = formatAddress(contactAddress);
    const conversationId = getConversationId(contact, account);

    log(`- Conversations id: ${conversationId}`);

    if (checkToken(sessions, account, token)) {
        const receivedMessages: EncryptionEnvelop[] = (
            messages.has(conversationId) ? messages.get(conversationId) : []
        ) as EncryptionEnvelop[];

        const forAccount = receivedMessages.filter(
            (envelop) => formatAddress(envelop.to) === account,
        );

        log(`- ${receivedMessages?.length} messages`);

        return {
            messages: forAccount,
        };
    } else {
        throw Error('Token check failed');
    }
}

// buffer message until delivery and sync acknoledgment
export function incomingMessage(
    data: { envelop: EncryptionEnvelop; token: string },
    sessions: Map<string, Session>,
    messages: Map<string, EncryptionEnvelop[]>,
    send: (socketId: string, envelop: EncryptionEnvelop) => void,
): Map<string, EncryptionEnvelop[]> {
    log('[incoming message]');
    const envelop = {
        ...data.envelop,
        deliveryServiceIncommingTimestamp: new Date().getTime(),
    };
    const account = formatAddress(formatAddress(data.envelop.from));
    const contact = formatAddress(formatAddress(data.envelop.to));
    const conversationId = getConversationId(account, contact);
    log(`- Conversations id: ${conversationId}`);

    if (checkToken(sessions, account, data.token)) {
        const newMessages = new Map<string, EncryptionEnvelop[]>(messages);
        const conversation = newMessages.has(conversationId)
            ? (newMessages.get(conversationId) as EncryptionEnvelop[])
            : [];

        conversation.push(envelop);

        if (!newMessages.has(conversationId)) {
            newMessages.set(conversationId, conversation);
        }

        const contactSession = sessions.get(contact);
        if (contactSession?.socketId) {
            log(`- Forwarding message to ${contact}`);
            send(contactSession.socketId, envelop);
        }

        return newMessages;
    } else {
        throw Error('Token check failed');
    }
}

// provide a new user with the addresses of accounts which tried to send messages to them
export function getPendingConversations(
    sessions: Map<string, Session>,
    pendingConversations: Map<string, Set<string>>,
    accountAddress: string,
    token: string,
): {
    pendingConversations: Map<string, Set<string>>;
    pendingConversationsForAccount: string[];
} {
    log(`[getPendingConversations]`);
    const account = formatAddress(accountAddress);

    log(`- Account: ${accountAddress}`);

    if (checkToken(sessions, account, token)) {
        const newPendingConversations = new Map<string, Set<string>>(
            pendingConversations,
        );
        const conversations = newPendingConversations.get(account);
        newPendingConversations.set(account, new Set<string>());
        if (conversations) {
            return {
                pendingConversations: newPendingConversations,
                pendingConversationsForAccount: Array.from(conversations),
            };
        } else {
            return {
                pendingConversations: newPendingConversations,
                pendingConversationsForAccount: [],
            };
        }
    } else {
        throw Error('Token check failed');
    }
}
export type GetPendingConversations = typeof getPendingConversations;

// create an entry that is used to notify a new user
// that there are already pending messages adderssed to them
export function createPendingEntry(
    accountAddress: string,
    contactAddress: string,
    token: string,
    sessions: Map<string, Session>,
    pendingConversations: Map<string, Set<string>>,
): Map<string, Set<string>> {
    log('[createPendingEntry] pending message');
    const account = formatAddress(accountAddress);
    const contact = formatAddress(contactAddress);
    log(`- Pending message from ${account} to ${contact}`);

    if (checkToken(sessions, account, token)) {
        const newPendingConversations = new Map<string, Set<string>>(
            pendingConversations,
        );
        if (pendingConversations.has(contact)) {
            const conversations = pendingConversations.get(
                contact,
            ) as Set<string>;
            newPendingConversations.set(contact, conversations.add(account));
        } else {
            newPendingConversations.set(contact, new Set<string>([account]));
        }

        return newPendingConversations;
    } else {
        throw Error('Token check failed');
    }
}

// delete messages sent before and equal the specified timestamp
// after an acknoledgment that the user stored the messages
export function handleSyncAcknoledgment(
    accountAddress: string,
    acknoledgments: Acknoledgment[],
    token: string,
    sessions: Map<string, Session>,
    messages: Map<string, EncryptionEnvelop[]>,
): Map<string, EncryptionEnvelop[]> {
    log('[handleSyncAcknoledgment]');
    const account = formatAddress(accountAddress);

    if (checkToken(sessions, account, token)) {
        const newMessages = new Map<string, EncryptionEnvelop[]>(messages);
        for (const acknoledgment of acknoledgments) {
            const contact = formatAddress(acknoledgment.contactAddress);
            const conversationId = getConversationId(account, contact);
            log(`- Handling acknoledgment for conversation ${conversationId}`);
            const conversation = newMessages.get(conversationId);

            if (conversation) {
                //remove all messages smaller or equal than timestamp and addressed to the account address
                const messagesToKeep = conversation.filter(
                    (envelop) =>
                        envelop.deliveryServiceIncommingTimestamp! >
                            acknoledgment.messageDeliveryServiceTimestamp ||
                        formatAddress(envelop.from) === accountAddress,
                );

                newMessages.set(conversationId, messagesToKeep);
                log(
                    `- Removing ${
                        conversation.length - messagesToKeep.length
                    } messages`,
                );
            }
        }

        return newMessages;
    } else {
        throw Error('Token check failed');
    }
}
