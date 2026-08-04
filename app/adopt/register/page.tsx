import { RegisterForm } from "@/components/RegisterForm";
import { Track } from "@/components/Track";

export const maxDuration = 300; // 领养后 after() 里异步生成首日内容、立绘、相遇照片与姿势集(doc/15,姿势 5 张约 100s)

// 岛民登记册（doc/10 §2）：不是"创建角色信息"，是第一次见到它之后帮它登个记。
// 性格参数彻底隐身——三道"你觉得它是什么样"的心理选择题在服务端映射三轴。
// 表单本体在 components/RegisterForm.tsx（客户端）：出错就地显示、填过的不清空。

export default function RegisterPage() {
  return (
    <div className="mx-auto max-w-lg">
      <Track events={[{ name: "adopt_start" }]} />

      <div className="text-center">
        <p className="seal">岛民登记册</p>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          它就蹲在登记台边上打量你。岛主猫阿道翻开岛民册，笔尖蘸了蘸：
          <br />
          「几个小问题。答完，这只猫，就交给你啦。」
        </p>
      </div>

      <RegisterForm />
    </div>
  );
}
