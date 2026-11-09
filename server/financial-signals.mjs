import {parseDecimal} from '../src/lib/decimal.ts';

const rules={
  'classified-tb-draft-v1:gross_margin':{code:'negative_gross_margin',threshold:'0.00'},
  'classified-tb-draft-v1:net_margin':{code:'negative_net_margin',threshold:'0.00'},
  'classified-tb-draft-v1:current_ratio':{code:'current_ratio_below_one',threshold:'1.00'},
};

export function financialSignals(metrics){
  const findings=[];
  for(const metric of metrics){
    const rule=rules[metric.formula_code];
    if(!rule||metric.value_state!=='available'||metric.value===null)continue;
    const scale=Math.max(2,metric.value.split('.')[1]?.length??0);
    const triggered=parseDecimal(metric.value,scale).units<parseDecimal(rule.threshold,scale).units;
    findings.push({
      ruleVersion:'financial-signals-v1',ruleCode:rule.code,operator:'lt',threshold:rule.threshold,
      metricId:metric.id,observedValue:metric.value,unit:metric.unit,triggered,
    });
  }
  return findings;
}
