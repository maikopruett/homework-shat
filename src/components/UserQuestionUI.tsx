/**
 * UserQuestionUI Component
 *
 * Renders a question from the agent with clickable option buttons.
 * Used when the agent calls the ask_user tool to gather user input.
 */

import { useState } from 'react';
import type { UserQuestionRequest } from '../agent/types';

interface UserQuestionUIProps {
  question: UserQuestionRequest;
  onAnswer: (selectedOptions: string[]) => void;
  disabled?: boolean;
}

export default function UserQuestionUI({ question, onAnswer, disabled = false }: UserQuestionUIProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Guard against missing options
  const options = question.options || [];

  const handleOptionClick = (optionId: string) => {
    if (disabled) return;

    if (question.allowMultiple) {
      // Toggle selection for multi-select
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(optionId)) {
          next.delete(optionId);
        } else {
          next.add(optionId);
        }
        return next;
      });
    } else {
      // Single select - immediately submit
      onAnswer([optionId]);
    }
  };

  const handleSubmit = () => {
    if (selectedIds.size > 0) {
      onAnswer(Array.from(selectedIds));
    }
  };

  return (
    <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-2xl p-4 border border-purple-100 shadow-sm">
      {/* Question icon and text */}
      <div className="flex items-start gap-3 mb-4">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-purple-600">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>
        <p className="text-sm text-gray-800 font-medium pt-1.5">{question.question}</p>
      </div>

      {/* Options grid */}
      <div className="space-y-2">
        {options.length === 0 ? (
          <div className="text-sm text-gray-500 italic">Loading options...</div>
        ) : (
          options.map((option, index) => {
            const optionId = option.id || `option_${index}`;
            const isSelected = selectedIds.has(optionId);

            return (
              <button
                key={optionId}
                type="button"
                onClick={() => handleOptionClick(optionId)}
                disabled={disabled}
                className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all ${
                  disabled
                    ? 'opacity-50 cursor-not-allowed'
                    : 'cursor-pointer hover:shadow-md'
                } ${
                  isSelected
                    ? 'border-purple-500 bg-purple-50 shadow-sm'
                    : 'border-gray-200 bg-white hover:border-purple-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  {/* Checkbox/radio indicator for multi-select */}
                  {question.allowMultiple && (
                    <div
                      className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                        isSelected
                          ? 'border-purple-500 bg-purple-500'
                          : 'border-gray-300 bg-white'
                      }`}
                    >
                      {isSelected && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800">
                      {option.label || option.id || `Option ${options.indexOf(option) + 1}`}
                    </div>
                    {option.description && (
                      <div className="text-xs text-gray-500 mt-0.5">{option.description}</div>
                    )}
                  </div>

                  {/* Arrow for single select */}
                  {!question.allowMultiple && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-400">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Submit button for multi-select */}
      {question.allowMultiple && (
        <button
          type="button"
          onClick={handleSubmit}
          disabled={disabled || selectedIds.size === 0}
          className={`w-full mt-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
            disabled || selectedIds.size === 0
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-purple-600 text-white hover:bg-purple-700 shadow-sm'
          }`}
        >
          Continue with {selectedIds.size} selected
        </button>
      )}
    </div>
  );
}
