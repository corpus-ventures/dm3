/* eslint-disable max-len */
import { Conversation } from '@dm3-org/dm3-lib-storage/dist/new/types';
import { useContext, useEffect, useMemo, useState } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { StorageContext } from '../../context/StorageContext';
import { ContactPreview, getDefaultContract } from '../../interfaces/utils';
import { useMainnetProvider } from '../mainnetprovider/useMainnetProvider';
import { hydrateContract } from './hydrateContact';
import { fetchPendingConversations } from '../../adapters/messages';
import { normalizeEnsName } from '@dm3-org/dm3-lib-profile';

export const useConversation = () => {
    const mainnetProvider = useMainnetProvider();
    const {
        getConversations,
        addConversationAsync,
        initialized: storageInitialized,
        toggleHideContactAsync,
    } = useContext(StorageContext);

    const [contacts, setContacts] = useState<Array<ContactPreview>>([]);
    const [selectedContactName, setSelectedContactName] = useState<
        string | undefined
    >(undefined);
    const [conversationsInitialized, setConversationsInitialized] =
        useState<boolean>(false);

    const conversationCount = useMemo(() => contacts.length, [contacts]);

    const { account, deliveryServiceToken } = useContext(AuthContext);

    const selectedContact = useMemo(() => {
        return contacts.find(
            (contact) =>
                contact.contactDetails.account.ensName === selectedContactName,
        );
    }, [selectedContactName, contacts]);

    //For now we do not support pagination hence we always fetch all pages
    useEffect(() => {
        setConversationsInitialized(false);
        setSelectedContactName(undefined);
        setContacts([]);
        const init = async (page: number = 0) => {
            if (!account || !storageInitialized) {
                return;
            }
            const currentConversationsPage = await getConversations(page);

            //Hydrate the contacts by fetching their profile and DS profile
            const storedContacts = await Promise.all(
                currentConversationsPage.map((conversation) => {
                    const isHidden = conversation.isHidden;
                    //Hydrating is the most expensive operation. Hence we only hydrate if the contact is not hidden
                    if (isHidden) {
                        //If the contact is hidden we only return the contact with the default values. Once its unhidden it will be hydrated
                        return {
                            ...getDefaultContract(conversation.contactEnsName),
                            isHidden: true,
                        };
                    }
                    return hydrateContract(mainnetProvider, conversation);
                }),
            );
            //It might be the case that contacts are added via websocket. In this case we do not want to add them again
            const contactsWithoutDuplicates = storedContacts.filter(
                (newContact) =>
                    !contacts.some(
                        (existingContact) =>
                            existingContact.contactDetails.account.ensName ===
                            newContact.contactDetails.account.ensName,
                    ),
            );

            setContacts((prev) => [...prev, ...contactsWithoutDuplicates]);
            //as long as there is no pagination we fetch the next page until we get an empty page
            if (currentConversationsPage.length > 0) {
                await init(page + 1);
            }
            await handlePendingConversations();
            setConversationsInitialized(true);
        };
        init();
    }, [storageInitialized, account]);

    const handlePendingConversations = async () => {
        //At first we've to check if there are pending conversations not yet added to the list
        const pendingConversations = await fetchPendingConversations(
            mainnetProvider,
            account!,
            deliveryServiceToken!,
        );
        //Every pending conversation is going to be added to the conversation list
        pendingConversations.forEach((pendingConversation) => {
            addConversation(pendingConversation);
        });
    };

    const addConversation = (_ensName: string) => {
        const ensName = normalizeEnsName(_ensName);
        const alreadyAddedContact = contacts.find(
            (existingContact) =>
                existingContact.contactDetails.account.ensName === ensName,
        );
        //If the contact is already in the list return it
        if (alreadyAddedContact) {
            //Unhide the contact if it was hidden
            if (alreadyAddedContact.isHidden) {
                unhideContact(alreadyAddedContact);
            }
            return alreadyAddedContact;
        }

        const newContact: ContactPreview = getDefaultContract(ensName);
        //Set the new contact to the list
        setContacts((prev) => [...prev, newContact]);
        //Add the contact to the storage in the background
        addConversationAsync(ensName);
        //Hydrate the contact in the background
        hydrateExistingContactAsync(newContact);

        //Return the new onhydrated contact
        return newContact;
    };
    //When a conversation is added via the AddContacts dialog it should appeat in the conversation list immediately. Hence we're doing a hydrate here asynchroniously in the background
    const hydrateExistingContactAsync = async (contact: ContactPreview) => {
        const conversation: Conversation = {
            contactEnsName: contact.contactDetails.account.ensName,
            messageCounter: contact?.messageCount || 0,
            isHidden: contact.isHidden,
            key: '',
        };
        const hydratedContact = await hydrateContract(
            mainnetProvider,
            conversation,
        );
        console.log('hydrated contact', hydratedContact);
        setContacts((prev) => {
            return prev.map((existingContact) => {
                //Find the contact in the list and replace it with the hydrated one
                if (
                    existingContact.contactDetails.account.ensName ===
                    conversation.contactEnsName
                ) {
                    return hydratedContact;
                }
                return existingContact;
            });
        });
    };

    const toggleHideContact = (_ensName: string, isHidden: boolean) => {
        const ensName = normalizeEnsName(_ensName);
        setContacts((prev) => {
            return prev.map((existingContact) => {
                //Find the contact in the list and replace it with the hydrated one
                if (
                    existingContact.contactDetails.account.ensName === ensName
                ) {
                    return {
                        ...existingContact,
                        isHidden,
                    };
                }
                return existingContact;
            });
        });
        //update the storage
        toggleHideContactAsync(ensName, isHidden);
    };

    const hideContact = (_ensName: string) => {
        const ensName = normalizeEnsName(_ensName);
        toggleHideContact(ensName, true);
        setSelectedContactName(undefined);
    };

    const unhideContact = (contact: ContactPreview) => {
        toggleHideContact(contact.contactDetails.account.ensName, false);
        const unhiddenContact = {
            ...contact,
            isHidden: false,
        };
        hydrateExistingContactAsync(unhiddenContact);
    };

    return {
        contacts,
        conversationCount,
        addConversation,
        initialized: conversationsInitialized,
        setSelectedContactName,
        selectedContact,
        hideContact,
        unhideContact,
    };
};
