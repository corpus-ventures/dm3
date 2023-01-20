import { ethers } from 'ethers';
import * as Lib from 'dm3-lib/dist.backend';
import { getWeb3Provider } from 'dm3-lib/dist.backend/web3-provider';

type NetworkWithProvider = {
    [network: string]: ethers.providers.BaseProvider | undefined;
};

export function initializeWeb3Provider(
    deliveryServiceProperties: Lib.delivery.DeliveryServiceProperties,
) {
    const providers = mapNetworksToProvider(deliveryServiceProperties);

    return function getWeb3Provider(
        ensName: string,
    ): ethers.providers.BaseProvider | null {
        const segments = ensName.split('.');
        const [network] = segments.slice(-1);

        const provider = providers[network];

        if (!provider) {
            Lib.log(`[getWeb3Provider] network ${network}`);
            return null;
        }

        return provider;
    };
}

function mapNetworksToProvider(
    delivreyServiceProperties: Lib.delivery.DeliveryServiceProperties,
): NetworkWithProvider {
    const defaultNetworks: Lib.delivery.Networks = Object.create(
        Lib.delivery.DefaultNetworks,
    );
    const networksWithProvider: NetworkWithProvider = Object.create({});
    const networks = Object.entries(delivreyServiceProperties.networks);

    //At least one network has to be specified within the config.yml
    if (networks.length === 0) {
        throw Error(
            'Please specify at least one network by providing a rpcUrl using the config.yml',
        );
    }

    networks.forEach(([name, customConfig]) => {
        //There is a default config avaible for that specific network
        if (defaultNetworks[name]) {
            const { url, chainId, ensAddress } = {
                //first add the defaultConfig
                ...defaultNetworks[name],
                //then apply the config.yml
                ...customConfig,
            };
            networksWithProvider[name] = createProviderInstance({
                name,
                chainId,
                ensAddress,
                url,
            });
            return;
        }
        /**
         * There was a custom network added. Before it can be added to the enabled networks it must be ensured
         * that url, ensAddress, and chainId are defined
         */

        const { url, chainId, ensAddress } = customConfig;

        if (!chainId) {
            throw Error(`chainId is missing for network:${name}`);
        }
        if (!ensAddress) {
            throw Error(`ensAddress address is missing for network:${name}`);
        }

        networksWithProvider[name] = createProviderInstance({
            url,
            chainId,
            ensAddress,
            name,
        });
    });

    return networksWithProvider;
}

function createProviderInstance({
    name,
    url,
    ensAddress,
    chainId,
}: {
    name: string;
    url: string;
    ensAddress: string;
    chainId: number;
}) {
    return new ethers.providers.StaticJsonRpcProvider(url, {
        name,
        chainId,
        ensAddress,
    });
}
