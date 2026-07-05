import { motion } from "framer-motion";
import {
    ArrowLeft,
    Construction,
    type LucideIcon,
    Sparkles,
} from "lucide-react";

interface PlaceholderScreenProps {
    title: string;
    description: string;
    icon?: LucideIcon;
    onBack: () => void;
}

export default function PlaceholderScreen({
    title,
    description,
    icon: Icon = Construction,
    onBack,
}: PlaceholderScreenProps) {
    return (
        <div className="placeholder-screen">
            <button className="placeholder-back" onClick={onBack}>
                <ArrowLeft size={19} />
                Назад
            </button>
            <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="placeholder-visual"
            >
                <Icon size={36} />
                <Sparkles size={18} />
            </motion.div>
            <span>Раздел развивается</span>
            <h1>{title}</h1>
            <p>{description}</p>
            <button className="placeholder-action" onClick={onBack}>
                Вернуться в PULLUP
            </button>
        </div>
    );
}

