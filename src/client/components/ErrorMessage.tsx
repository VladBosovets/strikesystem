export interface ErrorMessageProps {
  message: string;
  onRetry: () => void;
}

export function ErrorMessage({ message, onRetry }: ErrorMessageProps) {
  return (
    <div className="error-message" role="alert">
      <p className="error-message__text">{message}</p>
      <button className="error-message__retry" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}
