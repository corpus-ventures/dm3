import { ADDRESS_TO_PROFILE_KEY } from '.';
import { Redis } from '../getDatabase';

export function addressHasAlreadyAProfile(redis: Redis) {
    return async (address: string) => {
        return !!(await redis.get(ADDRESS_TO_PROFILE_KEY + address));
    };
}
