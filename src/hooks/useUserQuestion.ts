/**
 * useUserQuestion Hook
 *
 * Manages the state for agent user questions with clickable options.
 * Provides a promise-based interface for the agent loop to pause
 * and wait for user responses.
 */

import { useState, useCallback, useRef } from 'react';
import type { UserQuestionRequest, UserQuestionResponse } from '../agent/types';

interface UseUserQuestionReturn {
  /** Current pending question awaiting user response */
  pendingQuestion: UserQuestionRequest | null;

  /** Answer the current question with selected option IDs */
  answerQuestion: (questionId: string, selectedOptions: string[]) => void;

  /** Create a promise that resolves when the user answers (used by agent loop) */
  createQuestionPromise: (request: UserQuestionRequest) => Promise<UserQuestionResponse>;

  /** Clear the pending question without answering */
  clearQuestion: () => void;

  /** Whether a question is currently pending */
  isWaitingForAnswer: boolean;
}

/**
 * Hook for managing user questions during agent execution.
 *
 * The agent loop calls createQuestionPromise() which:
 * 1. Sets the pending question in state (triggers UI render)
 * 2. Returns a Promise that won't resolve until answerQuestion() is called
 *
 * The UI renders the question with buttons, and when the user clicks,
 * answerQuestion() is called which resolves the promise and clears the question.
 */
export function useUserQuestion(): UseUserQuestionReturn {
  const [pendingQuestion, setPendingQuestion] = useState<UserQuestionRequest | null>(null);

  // Store the promise resolver so answerQuestion can resolve it
  const resolverRef = useRef<((response: UserQuestionResponse) => void) | null>(null);

  /**
   * Create a promise for a user question.
   * Called by the agent loop when ask_user tool is executed.
   */
  const createQuestionPromise = useCallback(
    (request: UserQuestionRequest): Promise<UserQuestionResponse> => {
      return new Promise((resolve) => {
        // Store the resolver so we can call it when user answers
        resolverRef.current = resolve;
        // Set the question in state to trigger UI render
        setPendingQuestion(request);
      });
    },
    []
  );

  /**
   * Answer the pending question with selected options.
   * Called by the UI when user clicks option buttons.
   */
  const answerQuestion = useCallback(
    (questionId: string, selectedOptions: string[]) => {
      // Only answer if this is the current pending question
      if (pendingQuestion?.questionId !== questionId) {
        console.warn('[useUserQuestion] Attempted to answer wrong question', {
          pending: pendingQuestion?.questionId,
          answering: questionId,
        });
        return;
      }

      // Create the response
      const response: UserQuestionResponse = {
        questionId,
        selectedOptions,
        timestamp: Date.now(),
      };

      // Resolve the promise (this resumes the agent loop)
      if (resolverRef.current) {
        resolverRef.current(response);
        resolverRef.current = null;
      }

      // Clear the pending question
      setPendingQuestion(null);
    },
    [pendingQuestion]
  );

  /**
   * Clear the pending question without answering.
   * Used when the agent operation is cancelled.
   */
  const clearQuestion = useCallback(() => {
    // If there's a pending resolver, reject/resolve with empty response
    if (resolverRef.current && pendingQuestion) {
      resolverRef.current({
        questionId: pendingQuestion.questionId,
        selectedOptions: [],
        timestamp: Date.now(),
      });
      resolverRef.current = null;
    }
    setPendingQuestion(null);
  }, [pendingQuestion]);

  return {
    pendingQuestion,
    answerQuestion,
    createQuestionPromise,
    clearQuestion,
    isWaitingForAnswer: pendingQuestion !== null,
  };
}
