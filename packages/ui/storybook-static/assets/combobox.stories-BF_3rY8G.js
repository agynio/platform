import{j as e}from"./jsx-runtime-D_zvdyIk.js";import{r as d}from"./index-CGj_12n1.js";import{C as b,a as x,c as h,b as f,d as y,e as g}from"./command-BIkFNW3L.js";import{a as C,b as j,P as w}from"./popover-Clj7uKjH.js";import{B as S}from"./button-BndxJFtN.js";import{c as N}from"./cn-CIsb_jhR.js";import{c as k}from"./createLucideIcon-D7R0JOl0.js";import{C as q}from"./check-BICZfUKu.js";import"./index-86zy_OMe.js";import"./index-DW48STyt.js";import"./index-CIYbrQaX.js";import"./index-TY7crxDQ.js";import"./index-CR0oCOHf.js";import"./index-vmleiZMo.js";import"./index-C49e1uq5.js";import"./index-BIagkF6f.js";import"./index-C-YlrO5j.js";import"./index-D8dqFcAi.js";import"./index-BBPXtLXU.js";import"./index-DVxWRdtb.js";import"./index-BaRXXjUS.js";import"./index-DB8CXl0m.js";import"./index-B9c7NqGo.js";import"./index-Clx8toLk.js";import"./index-Cme87syZ.js";import"./index-Dp3B9jqt.js";import"./clsx-B-dksMZM.js";/**
 * @license lucide-react v0.544.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const _=[["path",{d:"m7 15 5 5 5-5",key:"1hf1tw"}],["path",{d:"m7 9 5-5 5 5",key:"sgt6xg"}]],T=k("chevrons-up-down",_);function s({options:t,value:o,onChange:a,placeholder:v="Select option..."}){const[i,l]=d.useState(!1),m=t.find(r=>r.value===o);return e.jsxs(C,{open:i,onOpenChange:l,children:[e.jsx(j,{asChild:!0,children:e.jsxs(S,{variant:"outline",role:"combobox","aria-expanded":i,className:"w-[200px] justify-between",children:[m?m.label:v,e.jsx(T,{className:"ml-2 size-4 shrink-0 opacity-50"})]})}),e.jsx(w,{className:"w-[200px] p-0",children:e.jsxs(b,{children:[e.jsx(x,{placeholder:"Search..."}),e.jsx(h,{children:"No results."}),e.jsx(f,{children:e.jsx(y,{children:t.map(r=>e.jsxs(g,{value:r.label,onSelect:()=>{a==null||a(r.value),l(!1)},children:[e.jsx(q,{className:N("mr-2 size-4",r.value===o?"opacity-100":"opacity-0")}),r.label]},r.value))})})]})})]})}s.__docgenInfo={description:"",methods:[],displayName:"Combobox",props:{options:{required:!0,tsType:{name:"Array",elements:[{name:"signature",type:"object",raw:"{ label: string; value: string }",signature:{properties:[{key:"label",value:{name:"string",required:!0}},{key:"value",value:{name:"string",required:!0}}]}}],raw:"Option[]"},description:""},value:{required:!1,tsType:{name:"string"},description:""},onChange:{required:!1,tsType:{name:"signature",type:"function",raw:"(value: string) => void",signature:{arguments:[{type:{name:"string"},name:"value"}],return:{name:"void"}}},description:""},placeholder:{required:!1,tsType:{name:"string"},description:"",defaultValue:{value:"'Select option...'",computed:!1}}}};const te={title:"Components/Combobox",component:s},n={render:()=>{const[t,o]=d.useState();return e.jsx(s,{options:[{label:"Apple",value:"apple"},{label:"Banana",value:"banana"},{label:"Cherry",value:"cherry"}],value:t,onChange:a=>o(a)})}};var p,u,c;n.parameters={...n.parameters,docs:{...(p=n.parameters)==null?void 0:p.docs,source:{originalSource:`{
  render: () => {
    const [value, setValue] = React.useState<string | undefined>();
    return <Combobox options={[{
      label: 'Apple',
      value: 'apple'
    }, {
      label: 'Banana',
      value: 'banana'
    }, {
      label: 'Cherry',
      value: 'cherry'
    }]} value={value} onChange={(v: string | undefined) => setValue(v)} />;
  }
}`,...(c=(u=n.parameters)==null?void 0:u.docs)==null?void 0:c.source}}};const oe=["Controlled"];export{n as Controlled,oe as __namedExportsOrder,te as default};
