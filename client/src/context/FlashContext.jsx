import { createContext, useCallback, useContext, useState } from 'react';

const FlashContext = createContext(null);

export function FlashProvider({ children }) {
  const [messages, setMessages] = useState([]);

  const showFlash = useCallback((message, category = 'success') => {
    const id = Date.now() + Math.random();
    setMessages((prev) => [...prev, { id, message, category }]);
    setTimeout(() => {
      setMessages((prev) => prev.filter((m) => m.id !== id));
    }, 6000);
  }, []);

  return (
    <FlashContext.Provider value={{ showFlash }}>
      {children}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] w-full max-w-sm px-4 space-y-2">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flash-message p-4 rounded-xl text-sm font-bold shadow-lg ${
              m.category === 'success' ? 'bg-emerald-100 text-emerald-700' : m.category === 'warning' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'
            }`}
          >
            {m.message}
          </div>
        ))}
      </div>
    </FlashContext.Provider>
  );
}

export function useFlash() {
  return useContext(FlashContext).showFlash;
}
