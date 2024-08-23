import { ethers } from 'ethers';
import abiJson from '@erc725/smart-contracts/artifacts/ERC725.json';
import { SmartAccountConnector } from './SmartAccountConnector';
import { DM3_KEYSTORE_KEY, LuksoKeyStore } from './KeyStore/LuksoKeyStore';

describe('SmartAccountConnector', () => {
    describe('SignUp', () => {
        let universalProfile: ethers.Contract;
        let upController1: ethers.Signer;
        let upController2: ethers.Signer;
        let upController3: ethers.Signer;

        beforeEach(async () => {
            upController1 = ethers.Wallet.createRandom();
            upController2 = ethers.Wallet.createRandom();
            upController3 = ethers.Wallet.createRandom();

            const c = new ethers.Contract(
                ethers.Wallet.createRandom().address,
                abiJson.abi,
                upController1,
            );

            const mockKvStore = new Map<string, string>();

            universalProfile = {
                ...c,
                setDataBatch: (k: string[], v: string[]) => {
                    k.forEach((key, idx) => {
                        mockKvStore.set(key, v[idx]);
                    });
                },
                getData: (k: string) => {
                    return mockKvStore.get(k);
                },
            } as unknown as ethers.Contract;
        });

        it('should write initial profile to KV store', async () => {
            const luksoKeyStore = new LuksoKeyStore(universalProfile);
            const connector = new SmartAccountConnector(
                luksoKeyStore,
                upController1,
            );
            const loginResult = await connector.login();

            const profileKeys = loginResult.payload;

            const data = JSON.parse(
                ethers.utils.toUtf8String(
                    universalProfile.getData(DM3_KEYSTORE_KEY),
                ),
            );
            console.log(data);

            const signerKeyStore = data[await upController1.getAddress()];
            expect(signerKeyStore).toBeDefined();

            expect(profileKeys!.encryptionKeyPair.publicKey).toBe(
                signerKeyStore.signerPublicKey,
            );
        });
        it('device 1 can decrypt profile from previous signUp', async () => {
            const luksoKeyStore = new LuksoKeyStore(universalProfile);
            const connector = new SmartAccountConnector(
                luksoKeyStore,
                upController1,
            );
            //First call of login performs the signUp
            const loginResult1 = await connector.login();
            const initialProfileKeys = loginResult1.payload;

            //Second call of login perfroms the signIn using the same keyStore
            const loginResult2 = await connector.login();
            const profileKeys = loginResult2.payload;

            expect(initialProfileKeys).toStrictEqual(profileKeys);
        });

        describe('New Device', () => {
            it('new device initialize key exchange by posting its publicKey', async () => {
                const luksoKeyStore = new LuksoKeyStore(universalProfile);
                const connector1 = new SmartAccountConnector(
                    luksoKeyStore,
                    upController1,
                );
                //Another device can signIn using the same keyStore
                const connector2 = new SmartAccountConnector(
                    luksoKeyStore,
                    upController2,
                );

                //First call of login performs the signUp
                const loginResult1 = await connector1.login();

                //Second device has to post its public key to the UP. So device 1 can share the profile keys
                const loginResult2 = await connector2.login();

                expect(loginResult2.type).toBe('NEW_DEVICE');
                expect(loginResult2.payload).toStrictEqual([
                    await upController1.getAddress(),
                ]);

                const onChainKeyStore = JSON.parse(
                    ethers.utils.toUtf8String(
                        universalProfile.getData(DM3_KEYSTORE_KEY),
                    ),
                );

                console.log(onChainKeyStore);
                //the keyStore should contain the profile of device1 and the public key of device2

                expect(
                    onChainKeyStore[await upController1.getAddress()],
                ).toBeDefined();
                expect(
                    onChainKeyStore[await upController2.getAddress()]
                        .signerPublicKey,
                ).toBeDefined();
            });
            it('key exchange syncs profile keys to new devices', async () => {
                const luksoKeyStore = new LuksoKeyStore(universalProfile);
                const connector1 = new SmartAccountConnector(
                    luksoKeyStore,
                    upController1,
                );
                //Another device can signIn using the same keyStore
                const connector2 = new SmartAccountConnector(
                    luksoKeyStore,
                    upController2,
                );
                //Thirs device to cover case of multiple devices
                const connector3 = new SmartAccountConnector(
                    luksoKeyStore,
                    upController2,
                );

                //First call of login performs the signUp
                const loginResult1 = await connector1.login();

                //Second device has to post its public key to the UP. So device 1 can share the profile keys
                const loginResult2 = await connector2.login();
                //Thrid device has to post its public key to the UP. So device 1 can share the profile keys
                const loginResult3 = await connector2.login();
                expect(loginResult1.type).toBe('SUCCESS');
                expect(loginResult2.type).toBe('NEW_DEVICE');
                expect(loginResult3.type).toBe('NEW_DEVICE');
            });
        });
    });
});
