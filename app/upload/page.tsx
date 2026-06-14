import UploadAnalyzer from "@/components/upload-analyzer";

export default function UploadPage() {
  return (
    <div className="page">
      <section className="page-header">
        <p className="eyebrow">上传分析</p>
        <h1>读取曲线文件，也解读 log 截图。</h1>
        <p className="lede">
          `.kpro` 会在服务端直接解析；图片会先保存并尝试视觉诊断。低置信结果会标记为需要人工确认。
        </p>
      </section>
      <UploadAnalyzer />
    </div>
  );
}
