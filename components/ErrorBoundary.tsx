import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  declare props: Props;
  declare state: State;
  declare setState: Component<Props, State>['setState'];

  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info);
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-screen bg-stone-50 dark:bg-stone-950 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-2xl p-6 shadow-xl">
          <div className="flex items-center gap-3 text-wine-600 dark:text-wine-500 mb-4">
            <AlertTriangle size={24} />
            <h1 className="text-xl font-serif text-stone-900 dark:text-white">Une erreur est survenue</h1>
          </div>
          <p className="text-sm text-stone-600 dark:text-stone-400 mb-4">
            Quelque chose s'est mal passé. Tu peux essayer de recharger la page ou revenir à l'accueil.
          </p>
          {this.state.error?.message && (
            <pre className="text-xs bg-stone-100 dark:bg-stone-950 p-3 rounded-lg overflow-auto text-stone-700 dark:text-stone-300 mb-4 max-h-32">
              {this.state.error.message}
            </pre>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => { this.reset(); window.location.href = '/'; }}
              className="flex-1 bg-wine-600 hover:bg-wine-700 text-white py-2 rounded-lg text-sm font-medium transition-colors"
            >
              Retour à l'accueil
            </button>
            <button
              onClick={() => window.location.reload()}
              className="flex-1 bg-stone-200 dark:bg-stone-800 hover:bg-stone-300 dark:hover:bg-stone-700 text-stone-900 dark:text-white py-2 rounded-lg text-sm font-medium transition-colors"
            >
              Recharger
            </button>
          </div>
        </div>
      </div>
    );
  }
}
