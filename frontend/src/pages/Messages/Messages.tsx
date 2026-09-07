import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { SquarePen, ArrowLeft, Info, MessageCircle } from 'lucide-react';
import { useChat } from '../../context/ChatContext';
import { usePageTitle } from '../../lib/usePageTitle';
import { conversationTitle, conversationAvatar } from '../../lib/chat';
import ConversationList, { ConversationAvatar } from '../../components/ConversationList/ConversationList';
import ChatThread from '../../components/ChatThread/ChatThread';
import NewChatModal from '../../components/NewChatModal/NewChatModal';
import ConversationInfoModal from '../../components/ConversationInfoModal/ConversationInfoModal';
import EmptyState from '../../components/EmptyState/EmptyState';
import './Messages.css';

/* /messages and /messages/:conversationId — list on the left, thread on the right. */
export default function MessagesPage() {
  const { conversationId } = useParams<{ conversationId?: string }>();
  const navigate = useNavigate();
  const { userId, conversations, loadingConversations, getConversation } = useChat();
  const [showNew, setShowNew] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  const conv = conversationId ? getConversation(conversationId) : undefined;
  const title = conv ? conversationTitle(conv, userId) : '';
  const other = conv ? conversationAvatar(conv, userId) : null;

  usePageTitle(conv ? title : 'Messages');

  const notFound = !!conversationId && !loadingConversations && !conv;

  return (
    <div className="messages-page">
      <div className={`messages-inner ${conversationId ? 'messages-inner--thread' : ''}`}>
        {/* Sidebar: conversation list */}
        <aside className="messages-sidebar">
          <div className="messages-sidebar-header">
            <h2>Messages</h2>
            <button className="messages-compose" onClick={() => setShowNew(true)} title="New message">
              <SquarePen size={18} />
            </button>
          </div>
          <ConversationList
            conversations={conversations}
            currentUserId={userId}
            activeId={conversationId}
            loading={loadingConversations}
            onSelect={(id) => navigate(`/messages/${id}`)}
          />
        </aside>

        {/* Main: thread */}
        <section className="messages-main">
          {conv ? (
            <>
              <header className="messages-thread-header">
                <button className="messages-back" onClick={() => navigate('/messages')} title="Back">
                  <ArrowLeft size={18} />
                </button>
                <ConversationAvatar conversation={conv} currentUserId={userId} size={38} />
                <div className="messages-thread-title">
                  {other
                    ? <Link to={`/profile/${other.user_id}`}><h3>{title}</h3></Link>
                    : <h3>{title}</h3>
                  }
                  <span>{conv.is_group ? `${conv.members.length} members` : 'Direct message'}</span>
                </div>
                <button className="messages-info" onClick={() => setShowInfo(true)} title="Conversation info">
                  <Info size={18} />
                </button>
              </header>
              <div className="messages-thread-body">
                <ChatThread key={conv.id} conversationId={conv.id} autoFocus />
              </div>
            </>
          ) : notFound ? (
            <div className="messages-placeholder">
              <EmptyState
                icon="search"
                title="Conversation not found"
                subtitle="It may have been removed, or you're no longer a member."
                action={<button className="btn-ghost" onClick={() => navigate('/messages')}>Back to messages</button>}
              />
            </div>
          ) : conversationId ? (
            <div className="messages-placeholder messages-placeholder--loading">
              <span>✦</span>
            </div>
          ) : (
            <div className="messages-placeholder">
              <div className="messages-placeholder-icon"><MessageCircle size={40} strokeWidth={1.2} /></div>
              <h3>Your messages</h3>
              <p>Pick a conversation, or start a new one.</p>
              <button className="btn-primary" onClick={() => setShowNew(true)}>New message</button>
            </div>
          )}
        </section>
      </div>

      {showNew && (
        <NewChatModal
          onClose={() => setShowNew(false)}
          onCreated={(id) => { setShowNew(false); navigate(`/messages/${id}`); }}
        />
      )}

      {showInfo && conv && (
        <ConversationInfoModal
          conversationId={conv.id}
          onClose={() => setShowInfo(false)}
          onLeft={() => navigate('/messages')}
        />
      )}
    </div>
  );
}
