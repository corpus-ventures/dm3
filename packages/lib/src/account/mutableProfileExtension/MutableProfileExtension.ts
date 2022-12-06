import { MessageType } from '../../messaging/Messaging';

export interface MutableProfileExtension {
    encryptionAlgorithm?: string[];
    // List not supported message types
    notSupportedMessageTypes: MessageType[];
}

export function getDefaultMutableProfileExtension(): MutableProfileExtension {
    return {
        notSupportedMessageTypes: ['NEW'],
    };
}
