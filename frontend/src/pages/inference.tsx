import { InferenceLab } from "@/components/dashboard/inference-lab";
export function InferencePage() {
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Inference lab</h1>
          <p>Upload one image to test the waste classifier.</p>
        </div>
      </div>
      <InferenceLab />
    </>
  );
}
