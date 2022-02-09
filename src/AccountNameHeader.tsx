import React, { useEffect, useState } from 'react';
import './App.css';
import { getAccountDisplayName } from './lib/Web3Provider';

interface AccountNameHeaderProps {
    account: string;
    ensNames: Map<string, string>;
}

function AccountNameHeader(props: AccountNameHeaderProps) {
    return (
        <div className="account-name">
            {getAccountDisplayName(props.account, props.ensNames)}
        </div>
    );
}

export default AccountNameHeader;
