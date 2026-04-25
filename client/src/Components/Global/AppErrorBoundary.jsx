import React from "react";

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
  }

  handleReset = () => {
    this.setState({ hasError: false });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, textAlign: "center", direction: "rtl" }}>
          <h2>حدث خلل غير متوقع</h2>
          <p>تم منع انهيار الصفحة بالكامل. يمكن إعادة التحميل والمتابعة.</p>
          <button type="button" onClick={this.handleReset}>
            إعادة التحميل
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
