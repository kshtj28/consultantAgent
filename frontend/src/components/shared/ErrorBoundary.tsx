import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props { children: ReactNode; }
interface State { hasError: boolean; error: Error | null; }

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '3rem', textAlign: 'center', color: '#94a3b8',
        }}>
          <AlertTriangle size={48} color="#ef4444" style={{ marginBottom: '1rem' }} />
          <h2 style={{ color: '#e2e8f0', margin: '0 0 0.5rem' }}>Something went wrong</h2>
          <p style={{ fontSize: '0.85rem', marginBottom: '1rem', maxWidth: 400 }}>
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <button onClick={this.handleReset} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 20px',
            background: '#3b82f6', color: 'white', border: 'none', borderRadius: 6,
            cursor: 'pointer', fontSize: '0.85rem',
          }}>
            <RefreshCw size={14} /> Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
