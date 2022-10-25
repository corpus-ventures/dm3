import { UserProfile } from '../account/Account';
import { formatAddress } from '../external-apis/InjectedWeb3API';
import { EncryptionEnvelop } from '../messaging/Messaging';
import { getConversationId } from '../storage/Storage';
import { getMessages, incomingMessage } from './Messages';

const getSession = async (address: string) => {
    const profile: UserProfile = {
        publicSigningKey: '',
        publicEncryptionKey: '',
        deliveryServices: [''],
    };
    return formatAddress(address) ===
        '0xDd36ae7F9a8E34FACf1e110c6e9d37D0dc917855'
        ? {
              account: '0xDd36ae7F9a8E34FACf1e110c6e9d37D0dc917855',
              signedUserProfile: {
                  profile,
                  signature: '',
              },

              token: '123',
          }
        : null;
};

test('incomingMessage auth', async () => {
    const storeNewMessage = async (
        conversationId: string,
        envelop: EncryptionEnvelop,
    ) => {};

    expect.assertions(1);

    await expect(() =>
        incomingMessage(
            {
                envelop: {
                    encryptedData: '',
                    encryptionVersion: 'x25519-xsalsa20-poly1305',
                    to: '0x25A643B6e52864d0eD816F1E43c0CF49C83B8292',
                    from: '0xDd36ae7F9a8E34FACf1e110c6e9d37D0dc917855',
                },
                token: 'abc',
            },

            getSession,
            storeNewMessage,
            () => {},
        ),
    ).rejects.toEqual(Error('Token check failed'));
});

test('incomingMessage', async () => {
    //Mock the time so we can test the message with the incomming timestamp
    jest.useFakeTimers().setSystemTime(new Date('2020-01-01'));
    const now = new Date().getTime();

    let messageContainer: {
        conversationId?: string;
        envelop?: EncryptionEnvelop;
    } = {};
    const storeNewMessage = async (
        conversationId: string,
        envelop: EncryptionEnvelop,
    ) => {
        messageContainer = { conversationId, envelop };
    };

    await incomingMessage(
        {
            envelop: {
                encryptedData: '',
                encryptionVersion: 'x25519-xsalsa20-poly1305',
                to: '0x25A643B6e52864d0eD816F1E43c0CF49C83B8292',
                from: '0xDd36ae7F9a8E34FACf1e110c6e9d37D0dc917855',
            },
            token: '123',
        },
        getSession,
        storeNewMessage,
        () => {},
    );

    const conversationId = getConversationId(
        '0x25A643B6e52864d0eD816F1E43c0CF49C83B8292',
        '0xDd36ae7F9a8E34FACf1e110c6e9d37D0dc917855',
    );

    expect(messageContainer).toStrictEqual({
        conversationId,
        envelop: {
            encryptedData: '',
            encryptionVersion: 'x25519-xsalsa20-poly1305',
            to: '0x25A643B6e52864d0eD816F1E43c0CF49C83B8292',
            from: '0xDd36ae7F9a8E34FACf1e110c6e9d37D0dc917855',
            incommingTimestamp: now,
            messageHash:
                '0x5f35dce98ba4fba25530a026ed80b2cecdaa31091ba4958b99b52ea1d068adad',
            signature: '123',
        },
    });
});

test('getMessages', async () => {
    const messages = new Map<string, EncryptionEnvelop[]>();
    const conversationIdToUse = getConversationId(
        '0x25A643B6e52864d0eD816F1E43c0CF49C83B8292',
        '0xDd36ae7F9a8E34FACf1e110c6e9d37D0dc917855',
    );

    const loadMessages = async (
        conversationId: string,
        offset: number,
        size: number,
    ) => {
        return conversationId === conversationIdToUse
            ? ([
                  {
                      encryptedData: 'a',
                      encryptionVersion: 'x25519-xsalsa20-poly1305',
                      from: '0x25A643B6e52864d0eD816F1E43c0CF49C83B8292',
                      to: '0xDd36ae7F9a8E34FACf1e110c6e9d37D0dc917855',
                      deliveryServiceIncommingTimestamp: 1,
                  },
                  {
                      encryptedData: 'b',
                      encryptionVersion: 'x25519-xsalsa20-poly1305',
                      to: '0x25A643B6e52864d0eD816F1E43c0CF49C83B8292',
                      from: '0xDd36ae7F9a8E34FACf1e110c6e9d37D0dc917855',
                      deliveryServiceIncommingTimestamp: 1,
                  },
                  {
                      encryptedData: 'c',
                      encryptionVersion: 'x25519-xsalsa20-poly1305',
                      from: '0x25A643B6e52864d0eD816F1E43c0CF49C83B8292',
                      to: '0xDd36ae7F9a8E34FACf1e110c6e9d37D0dc917855',
                      deliveryServiceIncommingTimestamp: 3,
                  },
              ] as EncryptionEnvelop[])
            : [];
    };

    expect(
        await getMessages(
            loadMessages,
            '0xDd36ae7F9a8E34FACf1e110c6e9d37D0dc917855',
            '0x25A643B6e52864d0eD816F1E43c0CF49C83B8292',
        ),
    ).toStrictEqual([
        {
            encryptedData: 'a',
            encryptionVersion: 'x25519-xsalsa20-poly1305',
            from: '0x25A643B6e52864d0eD816F1E43c0CF49C83B8292',
            to: '0xDd36ae7F9a8E34FACf1e110c6e9d37D0dc917855',
            deliveryServiceIncommingTimestamp: 1,
        },
        {
            encryptedData: 'c',
            encryptionVersion: 'x25519-xsalsa20-poly1305',
            from: '0x25A643B6e52864d0eD816F1E43c0CF49C83B8292',
            to: '0xDd36ae7F9a8E34FACf1e110c6e9d37D0dc917855',
            deliveryServiceIncommingTimestamp: 3,
        },
    ]);
});
