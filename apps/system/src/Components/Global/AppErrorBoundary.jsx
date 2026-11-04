import React from "react";
import { noteCrash } from "../../WebServer/services/problemLog";

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error("AppErrorBoundary caught:", error, info);
    noteCrash(error);
  }

  handleReset = () => {
    this.setState({ hasError: false });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, textAlign: "center", direction: "rtl" }}>
          <h2>حدث خطأ غير متوقع</h2>
          <p>يمكنك إعادة تحميل الصفحة والمتابعة، أو الضغط على الزر الأحمر لإرسال بلاغ إلى قسم IT.</p>
          <button type="button" onClick={this.handleReset}>
            إعادة التحميل
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
