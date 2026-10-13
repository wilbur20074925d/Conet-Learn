import type { StaticImageData } from "next/image"
import girl01 from "@/components/figure/six_girls_square_images/girl_01_top_left.png"
import girl02 from "@/components/figure/six_girls_square_images/girl_02_top_middle.png"
import girl03 from "@/components/figure/six_girls_square_images/girl_03_top_right.png"
import girl04 from "@/components/figure/six_girls_square_images/girl_04_bottom_left.png"
import girl05 from "@/components/figure/six_girls_square_images/girl_05_bottom_middle.png"
import girl06 from "@/components/figure/six_girls_square_images/girl_06_bottom_right.png"

export const STUDENT_FIGURE_COUNT = 6

const STUDENT_FIGURES: StaticImageData[] = [girl01, girl02, girl03, girl04, girl05, girl06]

export function studentFigureImage(index: number) {
  const count = STUDENT_FIGURES.length
  return STUDENT_FIGURES[((index % count) + count) % count]
}

export type StudentFigureMember = { id: string; name: string }

/** One stable avatar per groupmate: sorted by name, figures 1–6 then wrap. */
export function buildStudentFigureIndexMap(members: StudentFigureMember[]) {
  const sorted = [...members]
    .filter((member) => member.id && member.name.trim())
    .sort((a, b) => {
      const byName = a.name.localeCompare(b.name)
      return byName !== 0 ? byName : a.id.localeCompare(b.id)
    })
  const map = new Map<string, number>()
  sorted.forEach((member, index) => map.set(member.id, index % STUDENT_FIGURE_COUNT))
  return map
}
