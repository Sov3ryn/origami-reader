import { Component, type ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import { t } from "../i18n";

// If a page fails to draw, the rest of Work mode keeps working and nothing
// already saved is touched.
export class PageBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null; key: string }> {
  state = { error: null as Error | null, key: this.props.resetKey };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  static getDerivedStateFromProps(props: { resetKey: string }, state: { error: Error | null; key: string }) {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null;
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="page-error" role="alert">
        <TriangleAlert size={22} />
        <strong>{t("This page could not be shown.")}</strong>
        <p className="hint">{t("Your work is saved. Open another page and come back, or restart Origami.")}</p>
        <code>{this.state.error.message}</code>
        <button onClick={() => this.setState({ error: null })}>{t("Try again")}</button>
      </div>
    );
  }
}
