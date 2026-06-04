import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('GOYO render error.', error, errorInfo);
  }

  render() {
    if (this.state.error) {
      return (
        <main className="page" aria-label="app error">
          <section className="home-empty-card">
            <strong>앱을 불러오지 못했어요.</strong>
            <p>잠시 후 다시 시도해 주세요.</p>
            <button type="button" onClick={() => window.location.reload()}>
              다시 불러오기
            </button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
