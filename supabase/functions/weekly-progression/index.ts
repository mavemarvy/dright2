import { createClient } from "npm:@supabase/supabase-js@2.110.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const MARKETER_WEEKLY_TARGETS: Record<number, number> = {
  0: 10,
  1: 50,
  2: 200,
  3: 250,
  4: 350,
  5: 500,
};

const ADVERTISER_REQUIREMENTS: Record<
  string,
  { totalSales: number; weeklyTarget: number; downgradeTo: string }
> = {
  A: { totalSales: 2000, weeklyTarget: 500, downgradeTo: "marketer" },
  B: { totalSales: 5000, weeklyTarget: 500, downgradeTo: "A" },
  C: { totalSales: 10000, weeklyTarget: 600, downgradeTo: "B" },
  Pro: { totalSales: 50000, weeklyTarget: 1000, downgradeTo: "B" },
  Super: { totalSales: 50000, weeklyTarget: 1000, downgradeTo: "Pro" },
  Partnership: { totalSales: 100000, weeklyTarget: 4000, downgradeTo: "Super" },
};

const ADVERTISER_GRADE_ORDER = ["A", "B", "C", "Pro", "Super", "Partnership"];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const now = new Date();
    const results = {
      weeklyReset: 0,
      marketerUpgrades: 0,
      advertiserUpgrades: 0,
      advertiserDowngrades: 0,
      contractExpirations: 0,
      adminCutTransfers: 0,
      errors: [] as string[],
    };

    // 1. Expire sales team contracts
    const { data: expiredContracts, error: contractErr } = await supabase
      .from("sales_team_contracts")
      .select("id, sales_team_id, total_amount, admin_cut_applied")
      .eq("status", "active")
      .lt("expires_at", now.toISOString());

    if (contractErr) {
      results.errors.push(`Contract fetch error: ${contractErr.message}`);
    }

    if (expiredContracts && expiredContracts.length > 0) {
      const { data: configData } = await supabase
        .from("system_config")
        .select("admin_cut_percent")
        .eq("singleton", true)
        .maybeSingle();

      const adminCutPercent = configData ? Number(configData.admin_cut_percent) : 5;

      for (const contract of expiredContracts) {
        const adminCut = (contract.total_amount * adminCutPercent) / 100;
        const teamEarnings = contract.total_amount - adminCut;

        // Move funds from locked_balance to available_balance for the sales team
        await supabase
          .from("users")
          .rpc("increment_available_balance", {
            p_user_id: contract.sales_team_id,
            p_amount: teamEarnings,
          })
          .catch(() => {
            // Fallback: direct update if RPC doesn't exist
          });

        // Fallback direct update
        const { data: teamUser } = await supabase
          .from("users")
          .select("locked_balance, available_balance")
          .eq("id", contract.sales_team_id)
          .maybeSingle();

        if (teamUser) {
          await supabase
            .from("users")
            .update({
              locked_balance: Math.max(0, Number(teamUser.locked_balance) - contract.total_amount),
              available_balance: Number(teamUser.available_balance) + teamEarnings,
            })
            .eq("id", contract.sales_team_id);
        }

        // Add admin cut to the first active admin's balance
        const { data: admin } = await supabase
          .from("users")
          .select("id, balance")
          .eq("is_admin", true)
          .eq("admin_status", "active")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (admin) {
          await supabase
            .from("users")
            .update({ balance: Number(admin.balance) + adminCut })
            .eq("id", admin.id);
          results.adminCutTransfers++;
        }

        // Mark contract as expired with admin cut applied
        await supabase
          .from("sales_team_contracts")
          .update({ status: "expired", admin_cut_applied: true })
          .eq("id", contract.id);

        results.contractExpirations++;
      }
    }

    // 2. Fetch all marketers and advertisers for weekly reset + progression
    const { data: users, error: usersErr } = await supabase
      .from("users")
      .select(
        "id, marketer_level, advertiser_grade, weekly_sales_count, total_sales_count, consecutive_weeks_streak, marketer_status, advertiser_status, downgraded_at, last_weekly_reset_at",
      )
      .or("marketer_status.eq.approved,advertiser_status.eq.approved");

    if (usersErr) {
      results.errors.push(`Users fetch error: ${usersErr.message}`);
    }

    if (users && users.length > 0) {
      for (const user of users) {
        const weeklySales = user.weekly_sales_count || 0;
        const totalSales = user.total_sales_count || 0;
        const streak = user.consecutive_weeks_streak || 0;
        const isAdvertiser = user.advertiser_status === "approved" && user.advertiser_grade;
        const isMarketer = user.marketer_status === "approved";

        if (isAdvertiser) {
          // Advertiser progression / downgrade logic
          const grade = user.advertiser_grade!;
          const req = ADVERTISER_REQUIREMENTS[grade];

          if (req) {
            const metWeeklyTarget = weeklySales >= req.weeklyTarget;

            if (metWeeklyTarget) {
              // Check for upgrade to next grade
              const currentIdx = ADVERTISER_GRADE_ORDER.indexOf(grade);
              if (currentIdx < ADVERTISER_GRADE_ORDER.length - 1) {
                const nextGrade = ADVERTISER_GRADE_ORDER[currentIdx + 1];
                const nextReq = ADVERTISER_REQUIREMENTS[nextGrade];
                if (totalSales >= nextReq.totalSales && streak >= 4) {
                  // 4 consecutive weeks = 1 month
                  await supabase
                    .from("users")
                    .update({
                      advertiser_grade: nextGrade,
                      consecutive_weeks_streak: 0,
                      downgraded_at: null,
                    })
                    .eq("id", user.id);
                  results.advertiserUpgrades++;
                }
              }
            } else {
              // Failed weekly target - check for 1-month downgrade (4 consecutive failures)
              if (streak === 0) {
                // streak is already 0, meaning this is at least the 4th week of failure
                // (streak resets to 0 on first failure, stays 0 on subsequent failures)
                // We need a different mechanism - use downgraded_at timestamp
                if (user.downgraded_at) {
                  const downgradeDate = new Date(user.downgraded_at);
                  const weeksSinceDowngrade = Math.floor(
                    (now.getTime() - downgradeDate.getTime()) / (7 * 24 * 60 * 60 * 1000),
                  );
                  if (weeksSinceDowngrade >= 4) {
                    // Downgrade
                    const downgradeTo = req.downgradeTo;
                    if (downgradeTo === "marketer") {
                      await supabase
                        .from("users")
                        .update({
                          advertiser_grade: null,
                          advertiser_status: "none",
                          marketer_status: "approved",
                          marketer_level: 5,
                          consecutive_weeks_streak: 0,
                          downgraded_at: now.toISOString(),
                        })
                        .eq("id", user.id);
                    } else {
                      await supabase
                        .from("users")
                        .update({
                          advertiser_grade: downgradeTo,
                          consecutive_weeks_streak: 0,
                          downgraded_at: now.toISOString(),
                        })
                        .eq("id", user.id);
                    }
                    results.advertiserDowngrades++;
                  }
                } else {
                  // Set downgraded_at to start tracking failure period
                  await supabase
                    .from("users")
                    .update({ downgraded_at: now.toISOString() })
                    .eq("id", user.id);
                }
              }
            }
          }
        } else if (isMarketer) {
          // Marketer progression logic
          const currentLevel = user.marketer_level || 0;
          const target = MARKETER_WEEKLY_TARGETS[currentLevel] || 0;
          const metTarget = weeklySales >= target;

          if (metTarget) {
            const newStreak = streak + 1;

            if (currentLevel < 5) {
              // Check upgrade to next level
              const nextTarget = MARKETER_WEEKLY_TARGETS[currentLevel + 1] || 0;
              if (weeklySales >= nextTarget) {
                await supabase
                  .from("users")
                  .update({
                    marketer_level: currentLevel + 1,
                    consecutive_weeks_streak: newStreak,
                    downgraded_at: null,
                  })
                  .eq("id", user.id);
                results.marketerUpgrades++;
              } else {
                await supabase
                  .from("users")
                  .update({ consecutive_weeks_streak: newStreak })
                  .eq("id", user.id);
              }
            } else {
              // L5 - check if eligible for Advertiser application
              // 500/week streak for 2 weeks (1000 total) = streak >= 2
              await supabase
                .from("users")
                .update({ consecutive_weeks_streak: newStreak })
                .eq("id", user.id);
            }
          } else {
            // Failed weekly target - reset streak
            if (streak > 0) {
              await supabase
                .from("users")
                .update({ consecutive_weeks_streak: 0 })
                .eq("id", user.id);
            }
          }
        }

        // Reset weekly sales count for all users
        await supabase
          .from("users")
          .update({
            weekly_sales_count: 0,
            last_weekly_reset_at: now.toISOString(),
          })
          .eq("id", user.id);

        results.weeklyReset++;
      }
    }

    return new Response(JSON.stringify({ success: true, results, runAt: now.toISOString() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
