'use client';

import { motion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import { MEDIA } from '@/lib/welcome-media';
import MediaPlaceholder from './MediaPlaceholder';

const SERVICES = [
  {
    tag: '多维输入',
    title: '七大学习模块',
    description:
      '核心释义与双语例句、词根词缀视觉积木、YouTube 真实语境切片、AI 意象图解与社区助记——多通道吸收,一次看全一个词。',
    video: MEDIA.servicesCardVideos[0],
  },
  {
    tag: '科学巩固',
    title: '三种测验模式',
    description:
      '拼写、回忆、选择三种测验配合遗忘曲线安排复习,在你快要忘记的时候刚好出现,对抗自然遗忘。',
    video: MEDIA.servicesCardVideos[1],
  },
];

export default function ServicesSection() {
  return (
    <section id="features" className="relative overflow-hidden bg-black px-6 py-28 md:py-40">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(255,255,255,0.02)_0%,_transparent_60%)]" />

      <div className="relative mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 0.7 }}
          className="mb-12 flex items-center justify-between md:mb-16"
        >
          <h2 className="text-3xl tracking-tight text-white md:text-5xl">我们能做什么</h2>
          <p className="hidden text-sm text-white/40 md:block">40+ 精选考试词库</p>
        </motion.div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8">
          {SERVICES.map((service, i) => (
            <motion.div
              key={service.title}
              initial={{ opacity: 0, y: 50 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-100px' }}
              transition={{ duration: 0.8, delay: i * 0.15 }}
              className="liquid-glass group overflow-hidden rounded-3xl"
            >
              <div className="relative aspect-video overflow-hidden">
                {service.video ? (
                  <>
                    <video
                      className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                      src={service.video}
                      muted
                      autoPlay
                      loop
                      playsInline
                      preload="auto"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                  </>
                ) : (
                  <MediaPlaceholder label={`${service.title} 视频`} />
                )}
              </div>

              <div className="p-6 md:p-8">
                <div className="mb-4 flex items-center justify-between">
                  <p className="text-xs uppercase tracking-widest text-white/40">{service.tag}</p>
                  <span className="liquid-glass rounded-full p-2">
                    <ArrowUpRight className="h-4 w-4 text-white/70" />
                  </span>
                </div>
                <h3 className="mb-3 text-xl tracking-tight text-white md:text-2xl">
                  {service.title}
                </h3>
                <p className="text-sm leading-relaxed text-white/50">{service.description}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
