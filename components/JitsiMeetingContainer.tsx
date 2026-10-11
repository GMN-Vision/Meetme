'use client';

import { JitsiMeeting, type JitsiMeetingProps } from './JitsiMeeting';
import { Loader } from './Loader';

interface JitsiMeetingContainerProps extends JitsiMeetingProps {
  /** Show loading state */
  isLoading?: boolean;
  /** Error message to display */
  error?: string | null;
  /** Retry callback */
  onRetry?: () => void;
  /** Container background color */
  bgColor?: string;
}
 
/**
 * JitsiMeetingContainer Component
 * 
 * A wrapper around JitsiMeeting that handles loading states and error display.
 * Useful for async meeting setup or error handling scenarios.
 * 
 * @example
 * ```tsx
 * <JitsiMeetingContainer
 *   roomName={meetingId}
 *   displayName="User"
 *   isLoading={isFetching}
 *   error={meetingError}
 *   onRetry={() => location.reload()}
 * />
 * ```
 */
export function JitsiMeetingContainer({
  isLoading = false,
  error = null,
  onRetry,
  bgColor = 'bg-zinc-900',
  height = '100%',
  className,
  ...jitsiProps
}: JitsiMeetingContainerProps) {
  if (error) {
    return (
      <div className={`w-full flex items-center justify-center ${bgColor}`} style={{ height }}>
        <div className="px-4 py-8 text-center sm:px-6">
          <div className="mb-4">
            <svg
              className="mx-auto h-12 w-12 text-red-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4v.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-zinc-100 mb-2">
            Unable to Start Meeting
          </h3>
          <p className="text-zinc-400 text-sm mb-6 max-w-sm">{error}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="px-6 py-2 bg-zinc-700 text-white rounded-lg hover:bg-zinc-700 transition font-medium"
            >
              Try Again
            </button>
          )}
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={`w-full flex items-center justify-center ${bgColor}`} style={{ height }}>
        <div className="px-4 text-center">
          <Loader />
          <p className="mt-4 text-sm text-zinc-300 sm:text-base">Setting up your meeting...</p>
        </div>
      </div>
    );
  }

  return (
    <JitsiMeeting
      {...jitsiProps}
      height={height}
      className={className}
    />
  );
}
