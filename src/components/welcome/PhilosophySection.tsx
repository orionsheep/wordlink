'use client';

import { motion } from 'framer-motion';
import { MEDIA } from '@/lib/welcome-media';
import MediaPlaceholder from './MediaPlaceholder';

export default function PhilosophySection() {
  const hasVideo = MEDIA.philosophyVideo !== '';

  return (
    <section id="how" className="overflow-hidden bg-black px-6 py-28 md:py-40">
      <div className="mx-auto max-w-6xl">
        <motion.h2
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.8 }}
          className="font-serif-display mb-16 text-5xl tracking-tight text-white md:mb-24 md:text-7xl lg:text-8xl"
        >
          <span className="font-serif-display italic text-white/40">语境</span> x 联想
        </motion.h2>

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-12">
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.8 }}
          >
            {hasVideo ? (
              <video
                className="aspect-[4/3] w-full rounded-3xl object-cover"
                src={MEDIA.philosophyVideo}
                muted
                autoPlay
                loop
                playsInline
                preload="auto"
              />
            ) : (
              <MediaPlaceholder label="学习闭环演示" aspectClass="aspect-[4/3]" />
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.8 }}
            className="flex flex-col justify-center"
          >
            <div>
              <p className="mb-4 text-xs uppercase tracking-widest text-white/40">查词入图</p>
              <p className="text-base leading-relaxed text-white/70 md:text-lg">
                每查一个词,自动落入你的认知星图:同根、近义、搭配自动连线成网;
                例句、视频、图像、笔记多通道输入,一次看透一个词。
              </p>
            </div>

            <div className="my-10 h-px w-full bg-white/10" />

            <div>
              <p className="mb-4 text-xs uppercase tracking-widest text-white/40">抗遗忘巩固</p>
              <p className="text-base leading-relaxed text-white/70 md:text-lg">
                测验与艾宾浩斯遗忘曲线双引擎,在你快忘的时刻刚好出现,
                让每一次联结都沉淀为长期记忆。
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
