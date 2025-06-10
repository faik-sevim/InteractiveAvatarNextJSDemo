import React, { useEffect, useRef } from "react";

import { useMessageHistory, MessageSender } from "../logic";

export const MessageHistory: React.FC = () => {
  const { messages } = useMessageHistory();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;

    if (!container || messages.length === 0) return;

    container.scrollTop = container.scrollHeight;
  }, [messages]);

  return (
    <div
      ref={containerRef}
      className="w-full max-w-4xl mx-auto overflow-y-auto flex flex-col gap-3 p-4 max-h-[300px] bg-gray-50 border border-gray-200 rounded-xl shadow-sm"
    >
      {messages.length === 0 ? (
        <div className="text-center text-gray-500 py-8">
          <div className="text-sm">Henüz mesaj yok</div>
          <div className="text-xs mt-1">Konuşma başladığında mesajlar burada görünecek</div>
        </div>
      ) : (
        messages.map((message) => (
          <div
            key={message.id}
            className={`flex flex-col gap-2 max-w-[70%] ${
              message.sender === MessageSender.CLIENT
                ? "self-end items-end"
                : "self-start items-start"
            }`}
          >
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${
                  message.sender === MessageSender.AVATAR
                    ? "bg-blue-500"
                    : "bg-green-500"
                }`}
              />
              <span className="text-xs font-medium text-gray-600">
                {message.sender === MessageSender.AVATAR ? "Avatar" : "Siz"}
              </span>
            </div>
            <div
              className={`px-4 py-3 rounded-2xl shadow-sm ${
                message.sender === MessageSender.CLIENT
                  ? "bg-blue-500 text-white rounded-br-md"
                  : "bg-white text-gray-800 border border-gray-200 rounded-bl-md"
              }`}
            >
              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                {message.content}
              </p>
            </div>
          </div>
        ))
      )}
    </div>
  );
};
