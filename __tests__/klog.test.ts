import { describe, expect, it } from "vitest";
import { analyzeKlog, detectKlog, parseKlog } from "@/lib/klog";
import { classifyUpload } from "@/lib/uploads";

const SAMPLE_KLOG = `log_file_name:kaffelogic/roast-logs/log0003.klog
profile_file_name:Cupping v1.0.kpro
profile_short_name:Cupping
profile_designer:Kaffelogic Ltd
roast_date:26/03/2026 07:56:20 UTC
roasting_level:1.00000
recommended_level:2.00000
expect_fc:0.00000
expect_colrchange:0.00000
reference_load_size:120.000
boost_load_size:80.0000
model:KN1007B/E/D250620712
firmware_version:7.20.6
roast_levels:204.500,209.000,212.000
roast_profile:0,25,60,105,120,150,180,190
fan_profile:0,14700,120,14000,180,13200

offsets\t-8.5\t-8.75
time\t#spot_temp\t#=temp\t=mean_temp\t=profile\tprofile_ROR\t=actual_ROR\t#=desired_ROR\tpower_kW\t#^actual_fan_RPM
1.0\t25\t25\t25\t24\t10\t2\t5\t0.90\t13300
60.0\t105\t105\t105\t104\t9\t8\t5\t1.00\t13350
120.0\t151\t151\t150\t150\t6\t5\t4\t1.04\t13400
180.0\t191\t191\t190\t189\t3\t3\t3\t1.02\t13600
181.0\t190\t190\t189\t189\t3\t2.8\t3\t0.00\t17000
240.0\t80\t80\t80\t189\t3\t-8\t3\t0.00\t17000
`;

describe("klog parsing", () => {
  it("detects and classifies Kaffelogic roast logs before kpro text", () => {
    expect(detectKlog("log0003.klog", SAMPLE_KLOG)).toBe(true);
    expect(classifyUpload("log0003.klog", "text/plain", SAMPLE_KLOG)).toBe("klog");
  });

  it("extracts metadata, sampled curves and deterministic diagnosis", () => {
    const parsed = parseKlog(SAMPLE_KLOG, "log0003.klog");
    const analysis = analyzeKlog(parsed);

    expect(parsed.metadata.profileShortName).toBe("Cupping");
    expect(parsed.samples).toHaveLength(6);
    expect(parsed.fittedRoastAnchors?.length).toBeGreaterThanOrEqual(2);
    expect(parsed.fittedRoastAnchors?.[0].position).toEqual({ timeSeconds: 1, value: 25 });
    expect(parsed.fittedRoastAnchors?.at(-1)?.position.timeSeconds).toBe(181);
    expect(parsed.metrics.roastEndTimeSeconds).toBe(181);
    expect(parsed.metrics.roastEndTemperatureC).toBe(189);
    expect(parsed.metrics.avgAbsTrackingErrorC).toBeLessThan(2);
    expect(analysis.model).toBe("deterministic-klog-parser");
    expect(analysis.keyMetrics.roastEnd?.time).toBe("3:01");
  });
});
