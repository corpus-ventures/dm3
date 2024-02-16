import { useContext } from 'react';
import sendBtnIcon from '../../assets/images/send-btn.svg';
import { AuthContext } from '../../context/AuthContext';
import { ConversationContext } from '../../context/ConversationContext';
import { MessageContext } from '../../context/MessageContext';
import { MessageDataProps } from '../../interfaces/props';
import { GlobalContext } from '../../utils/context-utils';
import { scrollToBottomOfChat } from '../Chat/scrollToBottomOfChat';
import { onSubmitMessage } from './onSubmitMessage';

export function SendMessage(props: MessageDataProps) {
    const { account, profileKeys } = useContext(AuthContext);
    const { addMessage } = useContext(MessageContext);
    const { selectedContact } = useContext(ConversationContext);
    const { state, dispatch } = useContext(GlobalContext);

    async function submit() {
        await onSubmitMessage(
            state,
            dispatch,
            addMessage,
            props,
            profileKeys,
            account!,
            selectedContact!,
        );
        props.setMessageText('');
        scrollToBottomOfChat();
    }

    return (
        <span className="d-flex align-items-center pointer-cursor text-secondary-color">
            <img
                className="chat-svg-icon"
                src={sendBtnIcon}
                alt="send"
                onClick={submit}
            />
        </span>
    );
}
