import {Component,type ReactNode} from 'react';
export class AppErrorBoundary extends Component<{children:ReactNode},{failed:boolean}>{
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 render(){if(!this.state.failed)return this.props.children;return <main className="workspace-page" role="alert" dir="rtl"><h1>تعذر عرض الصفحة / Unable to display this page</h1><p>أعد تحميل الصفحة. البيانات التي تم حفظها تبقى محفوظة. / Reload the page. Saved data is retained.</p><button onClick={()=>window.location.reload()}>إعادة التحميل / Reload</button><p><a href="/#/workspace" onClick={()=>this.setState({failed:false})}>العودة لمساحة العمل / Back to workspace</a></p></main>;}
}
