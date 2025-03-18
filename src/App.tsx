import { useState, useCallback, memo, useMemo, useRef, useEffect } from 'react';
import axios from 'axios';
import debounce from 'lodash/debounce';

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;
const API_URL = import.meta.env.VITE_APP_SOCKET_URL;
const MAX_MESSAGES = 5000;

interface Message {
  text: string;
  isUser: boolean;
  id: string; // Add unique identifier
}

// Separate MessageComponent for better performance
const MessageComponent = memo(({ msg }: { msg: Message }) => (
  <div className={msg.isUser ? 'user-message' : 'bot-message'}>
    {msg.text}
  </div>
));

const App = () => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cleanup function for pending requests
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Memoize the messages limit function
  const setMessagesWithLimit = useCallback((newMessages: Message[]) => {
    return newMessages.length > MAX_MESSAGES 
      ? newMessages.slice(-MAX_MESSAGES)
      : newMessages;
  }, []);

  // Create unique ID for messages
  const createMessageId = useCallback(() => {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }, []);

  // Debounced input handler
  const debouncedSetInput = useMemo(
    () => debounce((value: string) => setInput(value), 150),
    []
  );

  // Cancel previous request if new one is made
  const cancelPreviousRequest = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const sendMessage = useCallback(async () => {
    const trimmedInput = input.trim();
    if (!trimmedInput || isLoading) return;

    cancelPreviousRequest();
    setIsLoading(true);

    const userMessage = { 
      text: trimmedInput, 
      isUser: true,
      id: createMessageId()
    };
    
    setMessages(prevMessages => setMessagesWithLimit([...prevMessages, userMessage]));
    setInput('');

    try {
      abortControllerRef.current = new AbortController();
      const timeoutId = setTimeout(() => {
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }
      }, 30000);

      const response = await axios.post(
        API_URL,
        {
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: userMessage.text }],
        },
        {
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          signal: abortControllerRef.current.signal,
        }
      );

      clearTimeout(timeoutId);

      const botMessage = {
        text: response.data.choices[0].message.content,
        isUser: false,
        id: createMessageId()
      };

      setMessages(prevMessages => setMessagesWithLimit([...prevMessages, botMessage]));
    } catch (error) {
      if (axios.isAxiosError(error) && error.name === 'CanceledError') {
        return; // Don't show error for cancelled requests
      }

      const errorMessage = {
        text: axios.isAxiosError(error) && error.response?.status === 429 
          ? 'Rate limit exceeded. Please try again later.'
          : 'Error: Failed to get response',
        isUser: false,
        id: createMessageId()
      };
        
      setMessages(prevMessages => setMessagesWithLimit([
        ...prevMessages,
        errorMessage
      ]));
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [input, setMessagesWithLimit, createMessageId, isLoading, cancelPreviousRequest]);

  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }, [sendMessage]);

  return (
    <div className="app">
      <h1>TINY TOYS</h1>
      <div className="chat-box">
        {messages.map((msg) => (
          <MessageComponent key={msg.id} msg={msg} />
        ))}
      </div>
      <div className="input-area">
        <textarea
          className="input-field"
          value={input}
          onChange={(e) => debouncedSetInput(e.target.value)}
          onKeyDown={handleKeyPress}
          placeholder="Type a message..."
          disabled={isLoading}
        />
        <button 
          onClick={sendMessage} 
          disabled={isLoading || !input.trim()}
        >
          {isLoading ? 'Sending...' : 'Send'}
        </button>
      </div>
    </div>
  );
};

export default App;
