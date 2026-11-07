import { Component, type ErrorInfo, type ReactNode } from 'react';

interface SceneErrorBoundaryProps {
  readonly children: ReactNode;
}

interface SceneErrorBoundaryState {
  readonly hasError: boolean;
}

export class SceneErrorBoundary extends Component<
  SceneErrorBoundaryProps,
  SceneErrorBoundaryState
> {
  state: SceneErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): SceneErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unable to render the game scene.', error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="full-panel" role="alert">
          <h2>COURT UNAVAILABLE</h2>
          <p className="panel-intro">The game could not load. Reload to try again.</p>
          <button className="game-btn game-btn--primary" onClick={() => window.location.reload()}>
            RELOAD GAME
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
