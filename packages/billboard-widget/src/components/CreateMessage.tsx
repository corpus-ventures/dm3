import { ethers } from 'ethers';
import { useContext, useEffect, useState } from 'react';
import gearIcon from '../assets/gear-icon.svg';

import { AuthContext } from '../context/AuthContext';
import Avatar from './Avatar';
import ButtonWithTimer from './ButtonWithTimer/ButtonWithTimer';
import { GlobalContext } from '../context/GlobalContext';
interface Props {
    onClickSettings?: () => void;
    onCreateMsg: (msg: string) => void;
}

const MIN_MESSAGE_LENGTH = 5;

function CreateMessage(props: Props) {
    const { ensName } = useContext(AuthContext);
    const { onCreateMsg, onClickSettings } = props;
    const [textAreaContent, setTextAreaContent] = useState('');
    const { options } = useContext(GlobalContext);

    const [userName, setUserName] = useState('');
    useEffect(() => {
        const resolveUserName = async () => {
            if (typeof options?.userNameResolver === 'function') {
                const resolvedUserName = await options.userNameResolver(
                    ensName,
                );
                setUserName(resolvedUserName);
            } else {
                setUserName(ensName);
            }
        };

        resolveUserName();
    }, [ensName, options]);
    return (
        <div className="create-message">
            <div className="container">
                <Avatar identifier={ensName} />
                <div className="message-create-area">
                    <div className="create-header">
                        <div className="info text-xxs">
                            {`Logged in as ${userName}`}
                        </div>
                        {typeof onClickSettings === 'function' ? (
                            <button className="settings-button">
                                <img src={gearIcon} alt="settings icon" />
                            </button>
                        ) : null}
                    </div>
                    <div className="text-area-wrapper">
                        <textarea
                            value={textAreaContent}
                            onChange={(e) => {
                                setTextAreaContent(e.target.value);
                            }}
                            className="text-area-input text-sm"
                            rows={2}
                        />
                        <div className="button-wrapper">
                            {
                                <ButtonWithTimer
                                    disabled={
                                        textAreaContent?.length <
                                        MIN_MESSAGE_LENGTH
                                    }
                                    timeout={options?.timeout}
                                    onClick={() => {
                                        onCreateMsg(textAreaContent);
                                        setTextAreaContent('');
                                    }}
                                ></ButtonWithTimer>
                            }
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default CreateMessage;
